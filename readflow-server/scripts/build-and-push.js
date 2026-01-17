'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function parseArgs(argv) {
  const out = {
    repository: 'virgoooox/readflowserver',
    changelogCount: 20,
    dryRun: false,
    doLogin: false,
    bumpVersion: true,
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
  const v = String(version || '').trim();
  const m = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(v);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function bumpPatch(version) {
  const parsed = parseSemver(version);
  if (!parsed) return '0.0.1';
  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
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
        '      --no-bump               Do not bump package.json version',
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

  const nextVersion = args.bumpVersion ? bumpPatch(baseVersion) : baseVersion;
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
  run('docker', ['push', tagVersion]);
  run('docker', ['push', tagLatest]);

  process.stdout.write(`Done: pushed ${tagLatest} and ${tagVersion}\n`);
}

main();
