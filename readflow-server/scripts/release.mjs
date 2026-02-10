import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, '..');
const packageJsonPath = path.join(serverDir, 'package.json');

function run(cmd, args, options = {}) {
  const res = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: options.cwd || serverDir,
    shell: true,
  });
  if (res.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}`);
  }
  return res;
}

function capture(cmd, args, options = {}) {
  const res = spawnSync(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: options.cwd || serverDir,
    encoding: 'utf8',
    shell: true,
  });
  return {
    ok: res.status === 0,
    stdout: res.stdout?.trim() || '',
    stderr: res.stderr?.trim() || '',
  };
}

async function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  console.log('🚀 Starting release process...');

  // 1. 获取当前版本
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const currentVersion = pkg.version;
  console.log(`Current version: ${currentVersion}`);

  // 2. 询问新版本号
  const versionType = await ask('Select version bump (patch/minor/major) or enter version (default: patch): ');
  let nextVersion = versionType || 'patch';
  
  if (['patch', 'minor', 'major'].includes(nextVersion)) {
    run('npm', ['version', nextVersion, '--no-git-tag-version'], { cwd: serverDir });
  } else {
    run('npm', ['version', nextVersion, '--no-git-tag-version'], { cwd: serverDir });
  }

  const newPkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  nextVersion = newPkg.version;
  console.log(`Next version: ${nextVersion}`);

  // 3. 更新 Changelog (从 git log 提取最近 20 条)
  console.log('📝 Updating changelog...');
  const gitLog = capture('git', ['log', '-n', '20', '--pretty=format:%s', '--', '.']);
  if (gitLog.ok) {
    const lines = gitLog.stdout.split('\n').filter(Boolean);
    newPkg.changelog = lines;
    fs.writeFileSync(packageJsonPath, JSON.stringify(newPkg, null, 2) + '\n');
  }

  // 4. Git Add
  console.log('📦 Staging changes...');
  run('git', ['add', '.']);

  console.log('\n--- STOP ---');
  console.log('1. 请在 Trae/IDE 中使用 AI 生成提交信息并完成 Commit。');
  console.log(`2. Commit 完成后，回到这里按回车继续打 Tag 并 Push。`);
  await ask('Press Enter after you have committed the changes...');

  // 5. 打 Tag 并 Push
  console.log(`🏷️ Creating tag ${nextVersion}...`);
  run('git', ['tag', nextVersion]);
  
  console.log('📤 Pushing to GitHub...');
  run('git', ['push', 'origin', 'main']);
  run('git', ['push', 'origin', nextVersion]);

  console.log(`\n✅ Done! GitHub Action will now build and push the image for version ${nextVersion}.`);
}

main().catch(err => {
  console.error('❌ Release failed:', err.message);
  process.exit(1);
});
