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

/**
 * 注入高级原生启动页修复逻辑
 * 强制修改 styles.xml 以确保 windowBackground 和透明图标生效
 */
function applyAdvancedNativeFix(projectRoot) {
  console.log('\n🎨 正在注入高级原生启动页优化...');
  const resDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res');
  const drawableDir = path.join(resDir, 'drawable');
  const stylesPath = path.join(resDir, 'values', 'styles.xml');

  if (!fs.existsSync(drawableDir)) {
    fs.mkdirSync(drawableDir, { recursive: true });
  }

  // 1. 确保透明图标资源存在
  const transparentIconPath = path.join(drawableDir, 'transparent_icon.xml');
  const transparentIconXml = `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24.0"
    android:viewportHeight="24.0">
</vector>`;
  fs.writeFileSync(transparentIconPath, transparentIconXml, 'utf-8');
  console.log('    - 已确保 transparent_icon.xml 存在');

  // 2. 确保启动图资源存在 (从 assets 拷贝)
  const splashGraphicPath = path.join(drawableDir, 'splash_graphic.png');
  const assetsSplashPath = path.join(projectRoot, 'assets', 'splash.png');
  if (fs.existsSync(assetsSplashPath)) {
    fs.copyFileSync(assetsSplashPath, splashGraphicPath);
    console.log('    - 已同步 splash_graphic.png');
  }

  // 3. 确保 launch_background.xml 存在
  // 注意：Android 原生 windowBackground 不支持 "cover" (等比例裁剪)
  // 为了全屏覆盖，这里使用 fill (拉伸)。如果需要比例完美，建议使用 JS 桥接方案。
  const launchBgPath = path.join(drawableDir, 'launch_background.xml');
  const launchBgXml = `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item><color android:color="#E6FBFF" /></item>
    <item>
        <bitmap 
            android:gravity="fill" 
            android:src="@drawable/splash_graphic" />
    </item>
</layer-list>`;
  fs.writeFileSync(launchBgPath, launchBgXml, 'utf-8');
  console.log('    - 已生成 launch_background.xml');

  // 4. 强制修改 styles.xml
  if (fs.existsSync(stylesPath)) {
    let stylesContent = fs.readFileSync(stylesPath, 'utf-8');

    // 替换 Theme.App.SplashScreen 部分
    const splashThemeRegex = /<style name="Theme\.App\.SplashScreen" parent="Theme\.SplashScreen">[\s\S]*?<\/style>/;
    const newSplashTheme = `  <style name="Theme.App.SplashScreen" parent="Theme.SplashScreen">
    <item name="android:windowBackground">@drawable/launch_background</item>
    <item name="windowSplashScreenBackground">@drawable/launch_background</item>
    <item name="windowSplashScreenAnimatedIcon">@drawable/transparent_icon</item>
    <item name="android:windowTranslucentStatus">true</item>
    <item name="android:windowTranslucentNavigation">true</item>
    <item name="android:windowFullscreen">true</item>
    <item name="android:windowDrawsSystemBarBackgrounds">true</item>
    <item name="android:windowLayoutInDisplayCutoutMode" tools:targetApi="28">shortEdges</item>
    <item name="postSplashScreenTheme">@style/AppTheme</item>
  </style>`;

    stylesContent = stylesContent.replace(splashThemeRegex, newSplashTheme);

    // 同时也加固 AppTheme
    const appThemeRegex = /<style name="AppTheme" parent="Theme\.AppCompat\.DayNight\.NoActionBar">[\s\S]*?<\/style>/;
    const newAppTheme = `  <style name="AppTheme" parent="Theme.AppCompat.DayNight.NoActionBar">
    <item name="android:editTextBackground">@drawable/rn_edit_text_material</item>
    <item name="colorPrimary">@color/colorPrimary</item>
    <item name="android:statusBarColor">@android:color/transparent</item>
    <item name="android:navigationBarColor">@android:color/transparent</item>
    <item name="android:windowTranslucentStatus">true</item>
    <item name="android:windowTranslucentNavigation">true</item>
    <item name="android:windowLayoutInDisplayCutoutMode" tools:targetApi="28">shortEdges</item>
  </style>`;

    stylesContent = stylesContent.replace(appThemeRegex, newAppTheme);

    fs.writeFileSync(stylesPath, stylesContent, 'utf-8');
    console.log('    ✓ styles.xml 已自动修正并发帖');
  }

  console.log('✅ 原生启动页优化注入完成\n');
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

  // 【优化】尝试从现有的 appVersion.ts 中读取信息
  let existingVersionInfo = null;
  if (fs.existsSync(appVersionPath)) {
    try {
      const content = fs.readFileSync(appVersionPath, 'utf-8');
      const verMatch = content.match(/version:\s*'([^']+)'/);
      const buildMatch = content.match(/buildNumber:\s*(\d+)/);
      const timeMatch = content.match(/updateTime:\s*'([^']+)'/);

      // 提取 changelog 数组
      const changelogStart = content.indexOf('changelog: [');
      const changelogEnd = content.indexOf('],', changelogStart);
      let existingChangelog = [];

      if (changelogStart !== -1 && changelogEnd !== -1) {
        const arrayStr = content.substring(changelogStart + 12, changelogEnd);
        existingChangelog = arrayStr.split('\n')
          .map(line => {
            const m = line.match(/'([^']+)'/);
            return m ? m[1].replace(/\\'/g, "'") : null;
          })
          .filter(l => l !== null);
      }

      if (verMatch) {
        existingVersionInfo = {
          version: verMatch[1],
          buildNumber: buildMatch ? parseInt(buildMatch[1], 10) : null,
          updateTime: timeMatch ? timeMatch[1] : null,
          changelog: existingChangelog
        };
      }
    } catch (e) {
      console.warn('⚠️  读取现有 appVersion.ts 失败');
    }
  }

  // 1. 处理版本号
  if (!version) {
    // 如果没传 --version，优先从 appVersion.ts 取，其次 app.json
    version = (existingVersionInfo && existingVersionInfo.version) || appJson.expo.version;
  }

  const versionCode = calculateVersionCode(version);

  // 2. 处理更新时间 (如果版本没变，保留旧时间)
  let updateTime = new Date().toISOString().split('T')[0];
  if (existingVersionInfo && existingVersionInfo.version === version && existingVersionInfo.updateTime) {
    updateTime = existingVersionInfo.updateTime;
  }

  console.log(`📝 目标版本: ${version} (Build: ${versionCode})`);

  // 3. 处理 Changelog
  if (autoGenerate) {
    changelog = getChangelogFromGit();
  } else if (changelog.length === 0) {
    // 如果没传 --changelog 且没 --auto-generate，优先保留旧的
    if (existingVersionInfo && existingVersionInfo.changelog && existingVersionInfo.changelog.length > 0) {
      changelog = existingVersionInfo.changelog;
      console.log('    - 保留现有的更新日志');
    } else {
      changelog = ['版本更新'];
    }
  }

  // 【优化】同时更新 app.json 中的 version 和 android.versionCode
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
  }

  // 更新 appVersion.ts
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

  // 只有内容变了才写入，防止无谓的编译触发
  const oldContent = fs.existsSync(appVersionPath) ? fs.readFileSync(appVersionPath, 'utf-8') : '';
  if (oldContent !== appVersionContent) {
    console.log('📝 更新 appVersion.ts...');
    fs.writeFileSync(appVersionPath, appVersionContent, 'utf-8');
    console.log('    ✓ appVersion.ts 已同步更新');
  } else {
    console.log('    - appVersion.ts 内容无变化，跳过更新');
  }

  // 执行 expo prebuild
  console.log('\n🔨 执行 expo prebuild...');
  // 使用 CI=1 环境变量来确保非交互模式
  execSync('npx expo prebuild --platform android', {
    stdio: 'inherit',
    cwd: projectRoot,
    env: commonEnv
  });

  // 【优化】注入高级原生启动页修复逻辑
  // 解决 expo prebuild 自动重置 styles.xml 的问题
  applyAdvancedNativeFix(projectRoot);

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
