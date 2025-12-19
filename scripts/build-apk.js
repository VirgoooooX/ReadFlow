#!/usr/bin/env node

/**
 * APK 构建脚本 (优化版)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

// 记录构建开始时间
const buildStartTime = Date.now();
const isWindows = os.platform() === 'win32';

// 【修复】強制 Windows 控制台使用 UTF-8 編碼，防止中文和表情符號亂碼
if (isWindows) {
  try {
    execSync('chcp 65001', { stdio: 'ignore' });
  } catch (e) {
    // 忽略错误
  }
}

// 通用的环境变量，强制 UTF-8
const commonEnv = {
  ...process.env,
  LANG: 'en_US.UTF-8',
  LC_ALL: 'en_US.UTF-8',
  PYTHONIOENCODING: 'utf-8',
  JAVA_TOOL_OPTIONS: '-Dfile.encoding=UTF-8',
  CI: '1',
  FORCE_COLOR: '0' // 进一步减少特殊字符，防止乱码
};

// 显示帮助信息
function showHelp() {
  console.log(`
📦 ReadFlow APK 构建脚本

用法: node scripts/build-apk.js [options]

选项:
  --version <ver>     指定版本号 (例: 2.1.0)
  --changelog <msg>   指定更新日志 (可多个)
  --auto-generate     从 Git 提交日志自动生成 changelog
  --fast              快速构建模式 (跳过缓存清除)
  --arch <arch>       只构建指定架构 (arm64/arm/x86/x86_64/all)
  --open              构建完成后打开 APK 所在目录
  --help              显示此帮助信息
`);
  process.exit(0);
}

// 格式化文件大小
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// 格式化时间
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0 ? `${minutes}分${remainingSeconds}秒` : `${seconds}秒`;
}

// 【优化】跨平台的文件夹删除函数
function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
      return true;
    } catch (e) {
      return false;
    }
  }
  return false;
}

// 清除缓存的辅助函数
function cleanCaches(projectRoot) {
  console.log('\n🧹 清除所有缓存...');

  const pathsToClean = [
    { name: 'Metro 缓存', path: path.join(projectRoot, '.metro-cache') },
    { name: 'npm 缓存', path: path.join(projectRoot, 'node_modules', '.cache') },
    { name: 'Android 构建目录', path: path.join(projectRoot, 'android', 'app', 'build') }
  ];

  pathsToClean.forEach(item => {
    console.log(`  - 清除 ${item.name}...`);
    if (removeDir(item.path)) {
      console.log(`    ✓ ${item.name} 已清除`);
    } else {
      console.log(`    - ${item.name} 无需清除或失败`);
    }
  });

  // 清除 Gradle 缓存
  console.log('  - 清除 Gradle 缓存...');
  try {
    const gradlew = isWindows ? 'gradlew.bat' : './gradlew';
    execSync(`${gradlew} clean --quiet`, {
      cwd: path.join(projectRoot, 'android'),
      stdio: 'ignore',
      env: commonEnv
    });
    console.log('    ✓ Gradle clean 完成');
  } catch (e) {
    console.log('    ⚠️  Gradle clean 失败（可忽略）');
  }

  console.log('✅ 缓存清除完成\n');
}

// 【优化】完全重写的 Git 日志获取逻辑
function getChangelogFromGit() {
  try {
    console.log('\n📝 从 Git 日志生成更新内容...');

    // 1. 获取最近的一个 Tag
    let range = '';
    try {
      // 强制使用 UTF-8 输出并禁用 quotepath
      const gitCmd = 'git -c core.quotepath=false -c i18n.logoutputencoding=utf-8 describe --tags --abbrev=0';
      const lastTag = execSync(gitCmd, {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf-8',
        env: commonEnv
      }).toString().trim();

      console.log(`    - 发现最近 Tag: ${lastTag}，将获取 ${lastTag} 到 HEAD 的提交`);
      range = `${lastTag}..HEAD`;
    } catch (e) {
      console.log('    - 未发现 Tag，将获取最近 20 条提交');
      range = '-20'; // 如果没有 tag，取最近 20 条
    }

    // 2. 获取提交日志
    // 强制使用 UTF-8 输出并禁用 pager
    const gitBase = 'git -c core.quotepath=false -c i18n.logoutputencoding=utf-8 --no-pager';
    const logCmd = range === '-20'
      ? `${gitBase} log --pretty=format:"%B" --no-merges -20`
      : `${gitBase} log ${range} --pretty=format:"%B" --no-merges`;

    const commits = execSync(logCmd, {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf-8',
      env: commonEnv
    }).toString();

    if (!commits || commits.trim().length === 0) {
      return ['版本更新 (暂无 Git 提交记录)'];
    }

    // 3. 过滤和清洗日志
    const lines = commits.split('\n');
    let changelog = [];

    // 策略 A：提取符合 Conventional Commits 规范的 (feat, fix 等) 或 以 -/* 开头的列表项
    const conventionalRegex = /^(feat|fix|perf|refactor|docs|style|test|chore|build|ci)(\([^)]*\))?:\s*/;

    for (const line of lines) {
      const cleanLine = line.trim();
      if (!cleanLine) continue;

      if (conventionalRegex.test(cleanLine)) {
        // 移除 pr 号 (#123)
        const msg = cleanLine.replace(conventionalRegex, '').replace(/\s*\(#\d+\)$/, '');
        changelog.push(msg);
      } else if (cleanLine.startsWith('- ') || cleanLine.startsWith('* ')) {
        // 如果是以 - 或 * 开头的列表项，也加入（去掉前缀）
        const msg = cleanLine.substring(2).trim();
        if (msg) changelog.push(msg);
      }
    }

    // 策略 B：如果提取太少，提取所有非空且稍微长一点的提交
    if (changelog.length < 2) {
      console.log('    - 提取内容较少，尝试通用提取模式...');
      const fallbackLogs = lines
        .map(l => l.trim())
        .filter(l => l.length > 5 && !l.startsWith('Merge') && !l.startsWith('Revert'))
        .slice(0, 10);

      // 合并并去重
      changelog = [...new Set([...changelog, ...fallbackLogs])];
    }

    // 去重并限制数量
    changelog = [...new Set(changelog)].slice(0, 15);

    return changelog.length > 0 ? changelog : ['版本更新'];

  } catch (error) {
    console.warn('\n⚠️  无法从 Git 生成更新内容:', error.message);
    return ['版本更新'];
  }
}

// ... 参数解析部分保持不变 ...
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) showHelp();

const versionIndex = args.indexOf('--version');
const changelogIndex = args.indexOf('--changelog');
const archIndex = args.indexOf('--arch');
const autoGenerate = args.includes('--auto-generate');
const fastBuild = args.includes('--fast');
const openAfterBuild = args.includes('--open');

let version = versionIndex !== -1 ? args[versionIndex + 1] : null;
let changelog = [];
let targetArch = archIndex !== -1 ? args[archIndex + 1] : 'all';

const archMap = {
  'arm64': 'arm64-v8a',
  'arm': 'armeabi-v7a',
  'x86': 'x86',
  'x86_64': 'x86_64',
  'all': 'armeabi-v7a,arm64-v8a,x86,x86_64'
};
const buildArch = archMap[targetArch] || archMap['all'];

if (changelogIndex !== -1) {
  for (let i = changelogIndex + 1; i < args.length; i++) {
    if (args[i].startsWith('--')) break;
    changelog.push(args[i]);
  }
}

const appJsonPath = path.join(__dirname, '..', 'app.json');
const appVersionPath = path.join(__dirname, '..', 'src', 'constants', 'appVersion.ts');

function calculateVersionCode(versionString) {
  const parts = versionString.split('.');
  let code = 0;
  parts.forEach((part, index) => {
    const num = parseInt(part, 10) || 0;
    code += num * Math.pow(100, parts.length - 1 - index);
  });
  return Math.max(1, Math.floor(code));
}

try {
  const projectRoot = path.join(__dirname, '..');

  console.log('\n🚀 开始构建 ReadFlow APK...\n');

  if (fastBuild) {
    console.log('⚡ 快速构建模式 - 跳过缓存清除');
  } else {
    cleanCaches(projectRoot);
  }

  if (targetArch !== 'all') {
    console.log(`📱 目标架构: ${targetArch} (${buildArch})`);
  }

  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));

  if (!version) {
    version = appJson.expo.version;
  }

  const versionCode = calculateVersionCode(version);
  const updateTime = new Date().toISOString().split('T')[0];

  console.log(`📝 当前版本: ${version} (Build: ${versionCode})`);

  // 处理 Changelog
  if (autoGenerate) {
    changelog = getChangelogFromGit();
  } else if (changelog.length === 0) {
    // 尝试从 appVersion.ts 读取旧的，这里简化逻辑，如果没有就默认
    changelog = ['版本更新'];
  }

  // 【优化】同时更新 app.json 中的 version 和 android.versionCode
  // 这样 expo prebuild 会自动处理 build.gradle，无需手动正则替换
  let isAppJsonChanged = false;
  if (appJson.expo.version !== version) {
    appJson.expo.version = version;
    isAppJsonChanged = true;
  }
  if (appJson.expo.android.versionCode !== versionCode) {
    appJson.expo.android.versionCode = versionCode;
    isAppJsonChanged = true;
  }

  if (isAppJsonChanged) {
    console.log(`📝 更新 app.json: v${version} (code: ${versionCode})`);
    fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n', 'utf-8');
    console.log('    ✓ app.json 已保存');
  } else {
    console.log('    - app.json 已是最新版本，无需更改');
  }

  // 更新 appVersion.ts
  console.log('📝 更新 appVersion.ts...');
  const changelogItems = changelog.map(item => `    '${item.replace(/'/g, "\\'")}',`).join('\n');
  const appVersionContent = `// 应用版本信息
// 此文件由构建脚本自动更新，请勿手动修改

export const APP_VERSION = {
  version: '${version}',
  buildNumber: ${versionCode},
  updateTime: '${updateTime}',
  changelog: [
${changelogItems}
  ],
};

export const APP_INFO = {
  name: 'ReadFlow',
  description: '一款专注英语阅读学习的应用',
};
`;
  fs.writeFileSync(appVersionPath, appVersionContent, 'utf-8');
  console.log('    ✓ appVersion.ts 已同步更新');
  console.log(`    - 包含 ${changelog.length} 条更新日志`);

  // 执行 expo prebuild
  console.log('\n🔨 执行 expo prebuild...');
  // 【修复】移除 --no-interactive 选项，较新版本 Expo CLI 不支持此参数
  // 使用 CI=1 环境变量来确保非交互模式
  execSync('npx expo prebuild --platform android --clean', {
    stdio: 'inherit',
    cwd: projectRoot,
    env: commonEnv
  });

  // 【优化】移除了手动修改 build.gradle 的代码
  // Expo Prebuild 已经根据 app.json 生成了正确的 build.gradle

  // 执行 gradle build
  console.log('\n🏗️  执行 gradle assembleRelease...');
  const gradlew = isWindows ? '.\\gradlew' : './gradlew';
  const gradleCmd = `${gradlew} assembleRelease -PreactNativeArchitectures=${buildArch}`;

  execSync(gradleCmd, {
    stdio: 'inherit',
    cwd: path.join(projectRoot, 'android'),
    env: commonEnv
  });

  // 重命名 APK
  const apkName = `ReadFlow-${version}${targetArch !== 'all' ? '-' + targetArch : ''}.apk`;
  const originalApkPath = path.join(projectRoot, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  const newApkPath = path.join(projectRoot, 'android', 'app', 'build', 'outputs', 'apk', 'release', apkName);

  if (fs.existsSync(originalApkPath)) {
    fs.renameSync(originalApkPath, newApkPath);
    console.log(`\n📦 APK 已重命名: ${apkName}`);
  }

  if (fs.existsSync(newApkPath)) {
    const stats = fs.statSync(newApkPath);
    console.log(`📊 APK 大小: ${formatFileSize(stats.size)}`);
  }

  const buildDuration = Date.now() - buildStartTime;

  console.log('\n' + '='.repeat(50));
  console.log('✨ APK 构建成功！');
  console.log('='.repeat(50));
  console.log(`📍 位置: ${newApkPath}`);
  console.log(`⏱️  构建耗时: ${formatDuration(buildDuration)}`);
  console.log('='.repeat(50) + '\n');

  if (openAfterBuild) {
    const apkDir = path.dirname(newApkPath);
    try {
      const explorer = isWindows ? 'explorer' : 'open';
      execSync(`${explorer} "${apkDir}"`, { stdio: 'ignore' });
      console.log('📂 已打开 APK 所在目录');
    } catch (e) { }
  }

} catch (error) {
  const buildDuration = Date.now() - buildStartTime;
  console.error(`\n❌ 构建失败 (耗时 ${formatDuration(buildDuration)}):`, error.message);
  process.exit(1);
}
