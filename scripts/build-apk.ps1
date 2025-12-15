# APK 构建脚本 (PowerShell 版本)
# 
# 使用方式：
# .\scripts\build-apk.ps1
# .\scripts\build-apk.ps1 -Version 1.0.0
# .\scripts\build-apk.ps1 -Version 1.0.0 -Changelog "新功能1","修复问题1"
# .\scripts\build-apk.ps1 -Version 1.0.0 -AutoGenerate

param(
    [string]$Version,
    [string[]]$Changelog,
    [switch]$AutoGenerate  # 自动从 Git 日志生成更新内容
)

# 定义文件路径
$scriptDir = Split-Path -Parent $MyInvocation.MyCommandPath
$projectRoot = Split-Path -Parent $scriptDir
$appJsonPath = Join-Path $projectRoot "app.json"
$buildGradlePath = Join-Path $projectRoot "android" "app" "build.gradle"
$appVersionPath = Join-Path $projectRoot "src" "constants" "appVersion.ts"

function Get-ChangelogFromGit {
    param([string]$CurrentVersion, [string]$PreviousVersion)
    
    try {
        Write-Host "📝 从 Git 日志生成更新内容..." -ForegroundColor Cyan
        
        if ($PreviousVersion) {
            # 获取两个版本之间的 commit
            $commits = git log "$PreviousVersion..$CurrentVersion" --pretty=format:"%B" --no-merges
        } else {
            # 如果没有上一个版本，获取最近的 commits
            $commits = git log --pretty=format:"%B" --no-merges -20
        }
        
        if (-not $commits) {
            return @("版本更新")
        }
        
        # 解析提交消息，提取有意义的内容
        $lines = $commits -split "`n" | Where-Object { $_ -match '^(feat|fix|perf|refactor|docs|style|test|chore)' -or $_.Trim().Length -gt 10 }
        $changelog = @()
        
        foreach ($line in $lines) {
            $line = $line.Trim()
            if ($line.Length -gt 0 -and $changelog.Count -lt 10) {  # 最多取 10 条
                # 清理提交消息格式
                $clean = $line -replace '^(feat|fix|perf|refactor|docs|style|test|chore)(\([^)]*\))?:\s*', ''
                $clean = $clean -replace '\(#\d+\)$', ''  # 移除 PR 号
                if ($clean.Length -gt 0 -and $clean -notmatch '^(Merge|Revert)') {
                    $changelog += $clean
                }
            }
        }
        
        if ($changelog.Count -eq 0) {
            return @("版本更新")
        }
        return $changelog
    } catch {
        Write-Host "⚠️  无法从 Git 生成更新内容: $_" -ForegroundColor Yellow
        return @("版本更新")
    }
}
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
    
    # 如果没有指定版本号，使用 app.json 中的版本号
    if (-not $Version) {
        $Version = $appJson.expo.version
    }
    
    $versionCode = Update-VersionCode -VersionString $Version
    $updateTime = Get-Date -Format "yyyy-MM-dd"
    
    Write-Host "📝 当前版本: $Version (Build: $versionCode)" -ForegroundColor Cyan
    
    # 生成或使用提供的更新日志
    if ($AutoGenerate) {
        # 从 git 日志自动生成
        # 获取上一个 tag (如果存在)
        $previousVersion = (git tag -l --sort=-version:refname | Select-Object -First 2 | Select-Object -Last 1) -replace '^v', ''
        $Changelog = Get-ChangelogFromGit -CurrentVersion $Version -PreviousVersion $previousVersion
    } elseif (-not $Changelog -or $Changelog.Count -eq 0) {
        $Changelog = @("版本更新")
    }
    
    # 更新 app.json 版本号
    if ($appJson.expo.version -ne $Version) {
        Write-Host "📝 更新版本号: $($appJson.expo.version) → $Version" -ForegroundColor Cyan
        $appJson.expo.version = $Version
        $appJson | ConvertTo-Json -Depth 10 | Set-Content $appJsonPath
        Write-Host "✅ app.json 已更新" -ForegroundColor Green
    }
    
    # 更新 appVersion.ts
    Write-Host "📝 更新 appVersion.ts..." -ForegroundColor Cyan
    
    # 如果没有提供更新日志，使用默认值
    if (-not $Changelog -or $Changelog.Count -eq 0) {
        $Changelog = @("版本更新")
    }
    
    # 生成 changelog 数组字符串
    $changelogItems = ($Changelog | ForEach-Object { "    '$_'," }) -join "`n"
    
    $appVersionContent = @"
// 应用版本信息
// 此文件由构建脚本自动更新，请勿手动修改

export const APP_VERSION = {
  // 版本号
  version: '$Version',
  // 构建号
  buildNumber: $versionCode,
  // 更新时间
  updateTime: '$updateTime',
  // 更新内容
  changelog: [
$changelogItems
  ],
};

// 应用信息
export const APP_INFO = {
  name: 'ReadFlow',
  description: '一款专注英语阅读学习的应用',
};
"@
    
    Set-Content $appVersionPath $appVersionContent -Encoding UTF8
    Write-Host "✅ appVersion.ts 已更新" -ForegroundColor Green
    
    # 执行 expo prebuild
    Write-Host "`n🔨 执行 expo prebuild..." -ForegroundColor Cyan
    Push-Location $projectRoot
    & npx expo prebuild --platform android --clean
    Pop-Location
    
    if ($LASTEXITCODE -ne 0) {
        throw "expo prebuild 失败"
    }
    
    # 更新 build.gradle
    Write-Host "`n📝 更新 Android build.gradle..." -ForegroundColor Cyan
    $buildGradle = Get-Content $buildGradlePath -Raw
    
    # 更新 versionName
    $buildGradle = $buildGradle -replace 'versionName\s+"[^"]*"', "versionName `"$Version`""
    
    # 更新 versionCode
    $buildGradle = $buildGradle -replace 'versionCode\s+\d+', "versionCode $versionCode"
    
    Set-Content $buildGradlePath $buildGradle
    Write-Host "✅ build.gradle 已更新 (versionCode: $versionCode, versionName: $Version)" -ForegroundColor Green
    
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
    $apkName = "ReadFlow-$Version.apk"
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
