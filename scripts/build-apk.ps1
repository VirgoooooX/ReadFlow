# APK 构建脚本 (PowerShell 版本)
# 
# 使用方式：
# .\scripts\build-apk.ps1
# .\scripts\build-apk.ps1 -Version 1.0.0

param(
    [string]$Version
)

# 定义文件路径
$scriptDir = Split-Path -Parent $MyInvocation.MyCommandPath
$projectRoot = Split-Path -Parent $scriptDir
$appJsonPath = Join-Path $projectRoot "app.json"
$buildGradlePath = Join-Path $projectRoot "android" "app" "build.gradle"

function Update-VersionCode {
    param([string]$VersionString)
    
    $parts = $VersionString -split '\.'
    $versionCode = 0
    
    for ($i = 0; $i -lt $parts.Count; $i++) {
        $num = [int]$parts[$i]
        $multiplier = [Math]::Pow(100, $parts.Count - 1 - $i)
        $versionCode += $num * $multiplier
    }
    
    return [Math]::Max(1, [Math]::Floor($versionCode))
}

try {
    # 读取 app.json
    $appJson = Get-Content $appJsonPath | ConvertFrom-Json
    
    if ($Version) {
        Write-Host "📝 更新版本号: $($appJson.expo.version) → $Version" -ForegroundColor Cyan
        $appJson.expo.version = $Version
        
        $versionCode = Update-VersionCode -VersionString $Version
        Write-Host "📊 计算 versionCode: $versionCode" -ForegroundColor Cyan
        
        # 保存 app.json
        $appJson | ConvertTo-Json -Depth 10 | Set-Content $appJsonPath
        Write-Host "✅ app.json 已更新" -ForegroundColor Green
    }
    
    # 执行 expo prebuild
    Write-Host "`n🔨 执行 expo prebuild..." -ForegroundColor Cyan
    Push-Location $projectRoot
    & npx expo prebuild --platform android --clean
    Pop-Location
    
    if ($LASTEXITCODE -ne 0) {
        throw "expo prebuild 失败"
    }
    
    # 更新 build.gradle
    if ($Version) {
        Write-Host "`n📝 更新 Android build.gradle..." -ForegroundColor Cyan
        $buildGradle = Get-Content $buildGradlePath -Raw
        $versionCode = Update-VersionCode -VersionString $Version
        
        # 更新 versionName
        $buildGradle = $buildGradle -replace 'versionName\s+"[^"]*"', "versionName `"$Version`""
        
        # 更新 versionCode
        $buildGradle = $buildGradle -replace 'versionCode\s+\d+', "versionCode $versionCode"
        
        Set-Content $buildGradlePath $buildGradle
        Write-Host "✅ build.gradle 已更新 (versionCode: $versionCode, versionName: $Version)" -ForegroundColor Green
    }
    
    # 执行 gradle build
    Write-Host "`n🏗️  执行 gradle assembleRelease..." -ForegroundColor Cyan
    Push-Location (Join-Path $projectRoot "android")
    & .\gradlew clean assembleRelease
    Pop-Location
    
    if ($LASTEXITCODE -ne 0) {
        throw "gradle assembleRelease 失败"
    }
    
    # 重命名 APK
    $originalApkPath = Join-Path $projectRoot 'android' 'app' 'build' 'outputs' 'apk' 'release' 'app-release.apk'
    $apkName = if ($Version) { "ReadFlow-$Version.apk" } else { "app-release.apk" }
    $newApkPath = Join-Path $projectRoot 'android' 'app' 'build' 'outputs' 'apk' 'release' $apkName
    
    if (Test-Path $originalApkPath) {
        Rename-Item -Path $originalApkPath -NewName $apkName -Force
        Write-Host "`n📦 APK 已重命名: $apkName" -ForegroundColor Green
    }
    
    Write-Host "`n✨ APK 构建成功！" -ForegroundColor Green
    Write-Host "📍 位置: $newApkPath" -ForegroundColor Green
    
} catch {
    Write-Host "`n❌ 构建失败: $_" -ForegroundColor Red
    exit 1
}
