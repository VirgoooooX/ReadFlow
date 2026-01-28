'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function sleepSync(ms) {
  const t = Number(ms);
  if (!Number.isFinite(t) || t <= 0) return;
  const ia = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(ia, 0, 0, t);
}

function parseArgs(argv) {
  const out = {
    repository: 'virgoooox/readflowserver',
    changelogCount: 20,
    dryRun: false,
    doLogin: false,
    bumpVersion: true,
    version: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run' || a === '-n') {
      out.dryRun = true;
      continue;
    }
    if (a === '--login') {
      out.doLogin = true;
      continue;
    }
    if (a === '--no-login') {
      out.doLogin = false;
      continue;
    }
    if (a === '--no-bump') {
      out.bumpVersion = false;
      continue;
    }
    if (a === '--version' || a === '-v') {
      const v = argv[i + 1];
      if (!v) throw new Error('Missing value for --version');
      out.version = String(v).trim();
      i += 1;
      continue;
    }
    if (a === '--repository' || a === '-r') {
      const v = argv[i + 1];
      if (!v) throw new Error('Missing value for --repository');
      out.repository = v;
      i += 1;
      continue;
    }
    if (a === '--changelog-count' || a === '-c') {
      const v = argv[i + 1];
      if (!v) throw new Error('Missing value for --changelog-count');
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) throw new Error('Invalid --changelog-count');
      out.changelogCount = Math.floor(n);
      i += 1;
      continue;
    }
    if (a === '--help' || a === '-h') {
      out.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${a}`);
  }

  return out;
}

function run(cmd, args, options = {}) {
  const res = spawnSync(cmd, args, {
    stdio: options.input ? ['pipe', 'inherit', 'inherit'] : 'inherit',
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    input: options.input,
    shell: false,
  });
  if (typeof res.status === 'number' && res.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}`);
  }
}

function isRetryableDockerPushOutput(text) {
  const s = String(text || '').toLowerCase();
  if (!s) return false;
  return (
    s.includes('dial tcp') ||
    s.includes('connectex') ||
    s.includes('tls handshake timeout') ||
    s.includes('i/o timeout') ||
    s.includes('timeout') ||
    s.includes('connection reset') ||
    s.includes('connection refused') ||
    s.includes('eof') ||
    s.includes('no such host') ||
    s.includes('temporary failure') ||
    s.includes('too many requests') ||
    s.includes('429') ||
    s.includes('service unavailable') ||
    s.includes('502') ||
    s.includes('503') ||
    s.includes('504')
  );
}

function runDockerPushWithRetry(imageRef, options = {}) {
  const maxAttemptsRaw = process.env.DOCKER_PUSH_RETRIES;
  const baseDelayMsRaw = process.env.DOCKER_PUSH_RETRY_BASE_MS;
  const maxAttempts = Math.max(1, parseInt(String(maxAttemptsRaw || '5'), 10) || 5);
  const baseDelayMs = Math.max(250, parseInt(String(baseDelayMsRaw || '2000'), 10) || 2000);

  let lastOut = '';
  let lastErr = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = spawnSync('docker', ['push', imageRef], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: options.cwd,
      env: options.env,
      encoding: 'utf8',
      shell: false,
    });

    const stdout = res.stdout || '';
    const stderr = res.stderr || '';
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
    lastOut = stdout;
    lastErr = stderr;

    if (typeof res.status === 'number' && res.status === 0) return;

    const combined = `${stdout}\n${stderr}`;
    const retryable = isRetryableDockerPushOutput(combined);
    const isLast = attempt >= maxAttempts;
    if (!retryable || isLast) {
      const extraHint = combined.toLowerCase().includes('docker desktop has no https proxy')
        ? '\nHint: Docker Desktop 当前未配置 HTTPS 代理，且网络需要代理时会 push 失败。请在 Docker Desktop 的 Proxy 设置里配置 HTTPS_PROXY。\n'
        : '';
      throw new Error(`Command failed: docker push ${imageRef}${extraHint}`);
    }

    const jitter = 0.85 + Math.random() * 0.3;
    const delayMs = Math.min(60_000, Math.round(baseDelayMs * Math.pow(2, attempt - 1) * jitter));
    process.stdout.write(`\nRetry docker push (${attempt}/${maxAttempts}) failed, wait ${delayMs}ms then retry...\n`);
    sleepSync(delayMs);
  }

  throw new Error(`Command failed: docker push ${imageRef}\n${String(lastOut).slice(-2000)}\n${String(lastErr).slice(-2000)}`);
}

function capture(cmd, args, options = {}) {
  const res = spawnSync(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    shell: false,
  });
  if (typeof res.status === 'number' && res.status !== 0) {
    return { ok: false, stdout: res.stdout || '', stderr: res.stderr || '' };
  }
  return { ok: true, stdout: res.stdout || '', stderr: res.stderr || '' };
}

function utcTimestamp() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${day}${hh}${mm}${ss}`;
}

function isValidDockerTag(tag) {
  return /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(tag);
}

function parseSemver(version) {
  const v0 = String(version || '').trim();
  const v = v0.startsWith('v') ? v0.slice(1) : v0;
  const m = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(v);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function bumpPatch(version) {
  const parsed = parseSemver(version);
  if (!parsed) return '0.0.1';
  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
}

function normalizeVersion(version) {
  const parsed = parseSemver(version);
  if (!parsed) return null;
  return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(
      [
        'Usage: node scripts/build-and-push.js [options]',
        '',
        'Options:',
        '  -n, --dry-run               Skip docker build/login/push (still bumps version/changelog)',
        '      --login                 Login to DockerHub using env vars',
        '      --no-login              Skip docker login (default)',
        '      --no-bump               Do not write version/changelog back to package.json',
        '  -v, --version <x.y.z>       Use specified version tag (default: bump patch)',
        '  -r, --repository <repo>     Docker repository (default: virgoooox/readflowserver)',
        '  -c, --changelog-count <n>   Commit subjects count for changelog (default: 20)',
        '  -h, --help                  Show help',
        '',
        'Env (used with --login):',
        '  DOCKERHUB_USERNAME',
        '  DOCKERHUB_TOKEN',
        '',
      ].join('\n')
    );
    return;
  }

  const serverDir = path.resolve(__dirname, '..');
  const repoRoot = path.resolve(serverDir, '..');
  const packageJsonPath = path.join(serverDir, 'package.json');
  const packageLockPath = path.join(serverDir, 'package-lock.json');

  const pkgRaw = fs.readFileSync(packageJsonPath, 'utf8');
  const pkg = JSON.parse(pkgRaw);
  const baseVersion = String(pkg && pkg.version ? pkg.version : '').trim();
  if (!baseVersion) throw new Error('Missing readflow-server package.json version');

  const buildId = utcTimestamp();
  const builtAt = new Date().toISOString();

  const git = capture('git', ['-C', repoRoot, 'log', '-n', String(args.changelogCount), '--pretty=format:%s', '--', 'readflow-server']);
  const changelogLines = git.ok
    ? git.stdout
        .split(/\r?\n/g)
        .map(s => s.trim())
        .filter(Boolean)
    : [];
  const changelogJson = JSON.stringify(changelogLines);

  const manualVersion = args.version ? normalizeVersion(args.version) : null;
  if (args.version && !manualVersion) {
    throw new Error(`Invalid --version: ${args.version} (expected x.y.z)`);
  }

  const nextVersion = manualVersion || (args.bumpVersion ? bumpPatch(baseVersion) : baseVersion);
  if (!isValidDockerTag(nextVersion)) throw new Error(`Invalid docker tag: ${nextVersion}`);

  if (args.bumpVersion) {
    pkg.version = nextVersion;
    pkg.changelog = changelogLines;
    writeJson(packageJsonPath, pkg);

    if (fs.existsSync(packageLockPath)) {
      try {
        const lock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'));
        if (lock && typeof lock === 'object') {
          if (typeof lock.version === 'string') lock.version = nextVersion;
          if (lock.packages && typeof lock.packages === 'object' && lock.packages[''] && typeof lock.packages[''] === 'object') {
            if (typeof lock.packages[''].version === 'string') lock.packages[''].version = nextVersion;
          }
          writeJson(packageLockPath, lock);
        }
      } catch {
      }
    }
  }

  const tagLatest = `${args.repository}:latest`;
  const tagVersion = `${args.repository}:${nextVersion}`;

  process.stdout.write(`Version: ${nextVersion}\n`);
  process.stdout.write(`Build: ${buildId}\n`);
  process.stdout.write(`Tags: ${tagLatest} , ${tagVersion}\n`);
  process.stdout.write(`Changelog items: ${changelogLines.length}\n`);

  const buildArgs = [
    '--build-arg',
    `SERVER_VERSION=${nextVersion}`,
    '--build-arg',
    `SERVER_BUILD=${buildId}`,
    '--build-arg',
    `SERVER_BUILD_TIME=${builtAt}`,
    '--build-arg',
    `SERVER_CHANGELOG=${changelogJson}`,
  ];

  const buildCmd = ['build', serverDir, '--pull', '-t', tagLatest, '-t', tagVersion, ...buildArgs];

  if (args.dryRun) {
    process.stdout.write('DRY_RUN: skip docker build / login / push\n');
    process.stdout.write(`Command: docker ${buildCmd.join(' ')}\n`);
    return;
  }

  if (args.doLogin) {
    const dockerUser = String(process.env.DOCKERHUB_USERNAME || '').trim();
    const dockerToken = String(process.env.DOCKERHUB_TOKEN || '').trim();
    if (!dockerUser || !dockerToken) {
      throw new Error('Missing DOCKERHUB_USERNAME / DOCKERHUB_TOKEN for --login');
    }
    run('docker', ['login', '-u', dockerUser, '--password-stdin'], { input: `${dockerToken}\n` });
  } else {
    process.stdout.write('Skip docker login (use existing local docker credentials). Use --login to force.\n');
  }
  run('docker', buildCmd);
  runDockerPushWithRetry(tagVersion, { cwd: serverDir, env: process.env });
  runDockerPushWithRetry(tagLatest, { cwd: serverDir, env: process.env });

  process.stdout.write(`Done: pushed ${tagLatest} and ${tagVersion}\n`);
}

main();
