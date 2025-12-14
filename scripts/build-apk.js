#!/usr/bin/env node

/**
 * APK 构建脚本
 * 支持动态设置版本号
 * 自动更新应用描述和版本信息
 * 
 * 使用方式：
 * node scripts/build-apk.js --version 1.0.0 --description "输入应用描述"
 * 或
 * npm run build:apk -- --version 1.0.0 --description "输入应用描述"
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 解析命令行参数
const args = process.argv.slice(2);
const versionIndex = args.indexOf('--version');
const descIndex = args.indexOf('--description');
const version = versionIndex !== -1 ? args[versionIndex + 1] : null;
const description = descIndex !== -1 ? args[descIndex + 1] : null;

const appJsonPath = path.join(__dirname, '..', 'app.json');
const androidBuildGradlePath = path.join(__dirname, '..', 'android', 'app', 'build.gradle');

try {
  // 读取 app.json
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));
  
  // 如果提供了版本号，则更新 app.json
  if (version) {
    console.log(`📝 更新版本号: ${appJson.expo.version} → ${version}`);
    appJson.expo.version = version;
    
    // 计算 versionCode（基于版本号的数字部分）
    const versionParts = version.split('.');
    let versionCode = 0;
    versionParts.forEach((part, index) => {
      const num = parseInt(part, 10) || 0;
      versionCode += num * Math.pow(100, versionParts.length - 1 - index);
    });
    versionCode = Math.max(1, Math.floor(versionCode)); // 确保至少为 1
    
    console.log(`📊 计算 versionCode: ${versionCode}`);
    
  // 保存更新后的 app.json
    fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n', 'utf-8');
    console.log('✅ app.json 已更新');
  }
  
  // 如果提供了应用描述，则更新应用描述文件
  if (description) {
    const appDescriptionPath = path.join(__dirname, '..', 'src', 'constants', 'appDescription.ts');
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD 格式
    
    const appDescriptionContent = `// 自动生成，不要手动编辑\n// 最后更新于: ${timestamp}\n\nexport const APP_DESCRIPTION = '${description.replace(/'/g, "\\'")}';
`;
    
    fs.writeFileSync(appDescriptionPath, appDescriptionContent, 'utf-8');
    console.log('✅ 应用描述已更新');
  }
  
  // 执行 expo prebuild
  console.log('\n🔨 执行 expo prebuild...');
  execSync('npx expo prebuild --platform android --clean', { 
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });
  
  // 更新 Android build.gradle 中的 versionCode 和 versionName
  if (version) {
    console.log('\n📝 更新 Android build.gradle...');
    let buildGradle = fs.readFileSync(androidBuildGradlePath, 'utf-8');
    
    // 查找并更新 versionName
    buildGradle = buildGradle.replace(
      /versionName\s+"[^"]*"/,
      `versionName "${version}"`
    );
    
    // 计算 versionCode
    const versionParts = version.split('.');
    let versionCode = 0;
    versionParts.forEach((part, index) => {
      const num = parseInt(part, 10) || 0;
      versionCode += num * Math.pow(100, versionParts.length - 1 - index);
    });
    versionCode = Math.max(1, Math.floor(versionCode));
    
    // 查找并更新 versionCode
    buildGradle = buildGradle.replace(
      /versionCode\s+\d+/,
      `versionCode ${versionCode}`
    );
    
    fs.writeFileSync(androidBuildGradlePath, buildGradle, 'utf-8');
    console.log(`✅ build.gradle 已更新 (versionCode: ${versionCode}, versionName: ${version})`);
  }
  
  // 执行 gradle build
  console.log('\n🏗️  执行 gradle assembleRelease...');
  execSync('.\\gradlew clean assembleRelease', {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..', 'android')
  });
  
  // 重命名 APK
  const apkName = version ? `ReadFlow-${version}.apk` : 'app-release.apk';
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
