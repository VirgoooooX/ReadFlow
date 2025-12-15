#!/usr/bin/env node

/**
 * APK 构建脚本
 * 支持动态设置版本号和更新日志
 * 自动更新 appVersion.ts 版本信息
 * 
 * 使用方式：
 * node scripts/build-apk.js
 * node scripts/build-apk.js --version 1.2.0
 * node scripts/build-apk.js --version 1.2.0 --changelog "新功能1" "修复问题1"
 * node scripts/build-apk.js --version 1.2.0 --auto-generate
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 介绍
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
const versionIndex = args.indexOf('--version');
const changelogIndex = args.indexOf('--changelog');
const autoGenerate = args.includes('--auto-generate');

let version = versionIndex !== -1 ? args[versionIndex + 1] : null;
let changelog = [];

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
    changelog = ['版本更新'];
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
  
  // 清理 Android 构建目录，避免文件锁定问题
  console.log('\n🧹 清理 Android 构建目录...');
  try {
    if (fs.existsSync(androidBuildDir)) {
      // 在 Windows 上使用 rimraf 或 rd 命令清理
      execSync('rd /s /q android\\app\\build', { 
        stdio: 'inherit',
        cwd: path.join(__dirname, '..')
      });
      console.log('✅ Android 构建目录已清理');
    }
  } catch (cleanError) {
    console.warn('⚠️  清理构建目录时出错（可忽略）:', cleanError.message);
  }
  
  // 执行 expo prebuild
  console.log('\n🔨 执行 expo prebuild...');
  execSync('npx expo prebuild --platform android --clean', { 
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
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
  execSync('.\\gradlew clean assembleRelease', {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..', 'android')
  });
  
  // 重命名 APK
  const apkName = `ReadFlow-${version}.apk`;
  const originalApkPath = path.join(__dirname, '..', 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  const newApkPath = path.join(__dirname, '..', 'android', 'app', 'build', 'outputs', 'apk', 'release', apkName);
  
  if (fs.existsSync(originalApkPath)) {
    fs.renameSync(originalApkPath, newApkPath);
    console.log(`\n📦 APK 已重命名: ${apkName}`);
  }
  
  console.log('\n✨ APK 构建成功！\n');
  console.log(`📍 位置: ${newApkPath}`);
  
} catch (error) {
  console.error('\n❌ 构建失败:', error.message);
  process.exit(1);
}