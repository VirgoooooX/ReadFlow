#!/usr/bin/env node

/**
 * APK 构建脚本
 * 支持动态设置版本号和更新日志
 * 自动更新 appVersion.ts 版本信息
 * 
 * 使用方式：
 * node scripts/build-apk.js                              # 基本构建
 * node scripts/build-apk.js --version 1.2.0             # 指定版本号
 * node scripts/build-apk.js --version 1.2.0 --changelog "新功能1" "修复问题1"
 * node scripts/build-apk.js --auto-generate             # 从 Git 自动生成 changelog
 * node scripts/build-apk.js --fast                      # 快速构建（跳过缓存清除）
 * node scripts/build-apk.js --arch arm64                # 只构建指定架构
 * node scripts/build-apk.js --help                      # 显示帮助
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 记录构建开始时间
const buildStartTime = Date.now();

// 显示帮助信息
function showHelp() {
  console.log(`
📦 ReadFlow APK 构建脚本

用法: node scripts/build-apk.js [options]

选项:
  --version <ver>     指定版本号 (例: 1.2.0)
  --changelog <msg>   指定更新日志 (可多个)
  --auto-generate     从 Git 提交日志自动生成 changelog
  --fast              快速构建模式 (跳过缓存清除)
  --arch <arch>       只构建指定架构 (arm64/arm/x86/x86_64/all)
  --open              构建完成后打开 APK 所在目录
  --help              显示此帮助信息

示例:
  node scripts/build-apk.js --version 1.3.0 --auto-generate
  node scripts/build-apk.js --fast --arch arm64
  node scripts/build-apk.js --version 1.3.0 --changelog "新增功能" "修复问题"
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
  if (minutes > 0) {
    return `${minutes}分${remainingSeconds}秒`;
  }
  return `${seconds}秒`;
}

// 清除缓存的辅助函数
function cleanCaches(projectRoot) {
  console.log('\n🧹 清除所有缓存...');
  
  // 1. 清除 Metro 缓存
  console.log('  - 清除 Metro bundler 缓存...');
  const metroCachePath = path.join(projectRoot, '.metro-cache');
  if (fs.existsSync(metroCachePath)) {
    try {
      execSync(`rmdir /s /q "${metroCachePath}"`, { stdio: 'ignore' });
      console.log('    ✓ Metro 缓存已清除');
    } catch (e) {
      console.log('    ⚠️  Metro 缓存清除失败（可忽略）');
    }
  }
  
  // 2. 清除 node_modules cache
  console.log('  - 清除 npm 缓存...');
  const npmCachePath = path.join(projectRoot, 'node_modules', '.cache');
  if (fs.existsSync(npmCachePath)) {
    try {
      execSync(`rmdir /s /q "${npmCachePath}"`, { stdio: 'ignore' });
      console.log('    ✓ npm 缓存已清除');
    } catch (e) {
      console.log('    ⚠️  npm 缓存清除失败（可忽略）');
    }
  }
  
  // 3. 清除 Gradle 缓存
  console.log('  - 清除 Gradle 缓存...');
  try {
    execSync('gradlew.bat clean --quiet', {
      cwd: path.join(projectRoot, 'android'),
      stdio: 'ignore'
    });
    console.log('    ✓ Gradle clean 完成');
  } catch (e) {
    console.log('    ⚠️  Gradle clean 失败（可忽略）');
  }
  
  // 4. 清除 Android 构建目录
  console.log('  - 清除 Android 构建目录...');
  const androidBuildDir = path.join(projectRoot, 'android', 'app', 'build');
  if (fs.existsSync(androidBuildDir)) {
    try {
      execSync(`rmdir /s /q "${androidBuildDir}"`, { stdio: 'ignore' });
      console.log('    ✓ Android build 目录已清除');
    } catch (e) {
      console.log('    ⚠️  Android build 目录清除失败（可忽略）');
    }
  }
  
  console.log('✅ 缓存清除完成\n');
}

// ... existing code ...

// 从现有的 appVersion.ts 读取上次的 changelog
function getPreviousChangelog() {
  try {
    const appVersionContent = fs.readFileSync(appVersionPath, 'utf-8');
    // 使用正则提取 changelog 数组内容
    const changelogMatch = appVersionContent.match(/changelog:\s*\[([\s\S]*?)\]/m);
    if (changelogMatch) {
      const changelogStr = changelogMatch[1];
      // 提取所有引号内的内容
      const items = changelogStr.match(/'([^']*)'/g);
      if (items) {
        return items.map(item => item.replace(/^'|'$/g, ''));
      }
    }
  } catch (e) {
    // 如果读取失败，返回空数组
  }
  return null;
}

function getChangelogFromGit(currentVersion, previousVersion) {
  try {
    console.log('\n📝 从 Git 日志生成更新内容...');
    
    let commits;
    if (previousVersion && previousVersion.length > 0) {
      // 获取两个版本之间的 commit
      try {
        commits = execSync(`git log ${previousVersion}..${currentVersion} --pretty=format:"%B" --no-merges`, {
          cwd: path.join(__dirname, '..')
        }).toString();
      } catch (e) {
        // 如果 tag 不存在，获取最近的 commits
        commits = execSync('git log --pretty=format:"%B" --no-merges -20', {
          cwd: path.join(__dirname, '..')
        }).toString();
      }
    } else {
      // 如果没有上一个版本，获取最近的 commits
      commits = execSync('git log --pretty=format:"%B" --no-merges -20', {
        cwd: path.join(__dirname, '..')
      }).toString();
    }
    
    if (!commits || commits.trim().length === 0) {
      return ['版本更新'];
    }
    
    // 解析提交消息，提取有意义的内容
    const lines = commits
      .split('\n')
      .filter(line => /^(feat|fix|perf|refactor|docs|style|test|chore)/.test(line) || line.trim().length > 10);
    
    const changelog = [];
    
    for (const line of lines) {
      if (changelog.length >= 10) break;  // 最多取 10 条
      
      let clean = line.trim();
      if (clean.length === 0) continue;
      
      // 清理提交消息格式
      clean = clean.replace(/^(feat|fix|perf|refactor|docs|style|test|chore)(\([^)]*\))?:\s*/, '');
      clean = clean.replace(/\(#\d+\)$/, '');  // 移除 PR 号
      
      if (clean.length > 0 && !/^(Merge|Revert)/.test(clean)) {
        changelog.push(clean);
      }
    }
    
    return changelog.length > 0 ? changelog : ['版本更新'];
  } catch (error) {
    console.warn('\n⚠️  无法从 Git 生成更新内容:', error.message);
    return ['版本更新'];
  }
}

// 解析命令行参数
const args = process.argv.slice(2);

// 显示帮助
if (args.includes('--help') || args.includes('-h')) {
  showHelp();
}

const versionIndex = args.indexOf('--version');
const changelogIndex = args.indexOf('--changelog');
const archIndex = args.indexOf('--arch');
const autoGenerate = args.includes('--auto-generate');
const fastBuild = args.includes('--fast');
const openAfterBuild = args.includes('--open');

let version = versionIndex !== -1 ? args[versionIndex + 1] : null;
let changelog = [];
let targetArch = archIndex !== -1 ? args[archIndex + 1] : 'all';

// 架构映射
const archMap = {
  'arm64': 'arm64-v8a',
  'arm': 'armeabi-v7a',
  'x86': 'x86',
  'x86_64': 'x86_64',
  'all': 'armeabi-v7a,arm64-v8a,x86,x86_64'
};
const buildArch = archMap[targetArch] || archMap['all'];

// 解析 changelog 参数（支持多个值）
if (changelogIndex !== -1) {
  for (let i = changelogIndex + 1; i < args.length; i++) {
    if (args[i].startsWith('--')) break;
    changelog.push(args[i]);
  }
}

const appJsonPath = path.join(__dirname, '..', 'app.json');
const androidBuildGradlePath = path.join(__dirname, '..', 'android', 'app', 'build.gradle');
const androidBuildDir = path.join(__dirname, '..', 'android', 'app', 'build');
const appVersionPath = path.join(__dirname, '..', 'src', 'constants', 'appVersion.ts');

// 计算 versionCode
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
  
  // 根据参数决定是否清除缓存
  if (fastBuild) {
    console.log('⚡ 快速构建模式 - 跳过缓存清除');
  } else {
    cleanCaches(projectRoot);
  }
  
  // 显示构建架构
  if (targetArch !== 'all') {
    console.log(`📱 目标架构: ${targetArch} (${buildArch})`);
  }
  
  // 读取 app.json
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));
  
  // 如果没有指定版本号，使用 app.json 中的版本号
  if (!version) {
    version = appJson.expo.version;
  }
  
  const versionCode = calculateVersionCode(version);
  const updateTime = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  console.log(`📝 当前版本: ${version} (Build: ${versionCode})`);
  
  // 生成或使用提供的更新日志
  if (autoGenerate) {
    // 从 Git 日志自动生成
    let previousVersion = null;
    try {
      // 获取上一个 tag
      const tags = execSync('git tag -l --sort=-version:refname', {
        cwd: path.join(__dirname, '..')
      }).toString().trim().split('\n');
      
      if (tags.length > 1) {
        previousVersion = tags[1].replace(/^v/, '');  // 使用第二新的 tag
      } else if (tags.length > 0) {
        previousVersion = tags[0].replace(/^v/, '');
      }
    } catch (e) {
      // 处理 git tag 不存在的情况
    }
    
    changelog = getChangelogFromGit(version, previousVersion);
  } else if (changelog.length === 0) {
    // 如果没有提供 changelog，尝试读取上个版本的内容
    const previousChangelog = getPreviousChangelog();
    if (previousChangelog && previousChangelog.length > 0) {
      changelog = previousChangelog;
      console.log('📝 使用上个版本的 changelog');
    } else {
      changelog = ['版本更新'];
    }
  }
  
  // 更新 app.json 版本号
  if (appJson.expo.version !== version) {
    console.log(`📝 更新版本号: ${appJson.expo.version} → ${version}`);
    appJson.expo.version = version;
    fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n', 'utf-8');
    console.log('✅ app.json 已更新');
  }
  
  // 更新 appVersion.ts
  console.log('📝 更新 appVersion.ts...');
  
  const changelogItems = changelog.map(item => `    '${item.replace(/'/g, "\\'")}',`).join('\n');
  
  const appVersionContent = `// 应用版本信息
// 此文件由构建脚本自动更新，请勿手动修改

export const APP_VERSION = {
  // 版本号
  version: '${version}',
  // 构建号
  buildNumber: ${versionCode},
  // 更新时间
  updateTime: '${updateTime}',
  // 更新内容
  changelog: [
${changelogItems}
  ],
};

// 应用信息
export const APP_INFO = {
  name: 'ReadFlow',
  description: '一款专注英语阅读学习的应用',
};
`;
  
  fs.writeFileSync(appVersionPath, appVersionContent, 'utf-8');
  console.log('✅ appVersion.ts 已更新');
  

  
  // 执行 expo prebuild
  console.log('\n🔨 执行 expo prebuild...');
  execSync('npx expo prebuild --platform android --clean', { 
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, CI: '1' }  // 设置 CI=1 跳过交互式提示
  });
  
  // 更新 Android build.gradle 中的 versionCode 和 versionName
  console.log('\n📝 更新 Android build.gradle...');
  let buildGradle = fs.readFileSync(androidBuildGradlePath, 'utf-8');
  
  // 查找并更新 versionName
  buildGradle = buildGradle.replace(
    /versionName\s+"[^"]*"/,
    `versionName "${version}"`
  );
  
  // 查找并更新 versionCode
  buildGradle = buildGradle.replace(
    /versionCode\s+\d+/,
    `versionCode ${versionCode}`
  );
  
  fs.writeFileSync(androidBuildGradlePath, buildGradle, 'utf-8');
  console.log(`✅ build.gradle 已更新 (versionCode: ${versionCode}, versionName: ${version})`);
  
  // 执行 gradle build
  console.log('\n🏗️  执行 gradle assembleRelease...');
  // 快速模式不执行 clean，正常模式已经在 cleanCaches 中执行过 clean
  const gradleCmd = fastBuild 
    ? `.\\gradlew assembleRelease -PreactNativeArchitectures=${buildArch}`
    : `.\\gradlew assembleRelease -PreactNativeArchitectures=${buildArch}`;
  
  execSync(gradleCmd, {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..', 'android')
  });
  
  // 重命名 APK
  const apkName = `ReadFlow-${version}${targetArch !== 'all' ? '-' + targetArch : ''}.apk`;
  const originalApkPath = path.join(__dirname, '..', 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  const newApkPath = path.join(__dirname, '..', 'android', 'app', 'build', 'outputs', 'apk', 'release', apkName);
  
  if (fs.existsSync(originalApkPath)) {
    fs.renameSync(originalApkPath, newApkPath);
    console.log(`\n📦 APK 已重命名: ${apkName}`);
  }
  
  // 显示 APK 大小
  if (fs.existsSync(newApkPath)) {
    const stats = fs.statSync(newApkPath);
    console.log(`📊 APK 大小: ${formatFileSize(stats.size)}`);
  }
  
  // 计算构建时间
  const buildDuration = Date.now() - buildStartTime;
  
  console.log('\n' + '='.repeat(50));
  console.log('✨ APK 构建成功！');
  console.log('='.repeat(50));
  console.log(`📍 位置: ${newApkPath}`);
  console.log(`⏱️  构建耗时: ${formatDuration(buildDuration)}`);
  console.log('='.repeat(50) + '\n');
  
  // 构建完成后打开目录
  if (openAfterBuild) {
    const apkDir = path.dirname(newApkPath);
    try {
      execSync(`explorer "${apkDir}"`, { stdio: 'ignore' });
      console.log('📂 已打开 APK 所在目录');
    } catch (e) {
      // 忽略打开失败
    }
  }
  
} catch (error) {
  const buildDuration = Date.now() - buildStartTime;
  console.error(`\n❌ 构建失败 (耗时 ${formatDuration(buildDuration)}):`, error.message);
  process.exit(1);
}