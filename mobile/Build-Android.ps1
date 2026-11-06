param([string]$ApiUrl = 'https://srv2091881.hstgr.cloud/service360/api/v1', [string]$GradleInitScript)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$signingDirectory = Join-Path $root '.runtime\android-signing'
$signingFile = Join-Path $signingDirectory 'signing.json'
if (-not $env:JAVA_HOME) { throw 'JAVA_HOME must point to a compatible JDK.' }
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not (Test-Path -LiteralPath $env:ANDROID_HOME)) { throw 'Android SDK not found; set ANDROID_HOME.' }
New-Item -ItemType Directory -Force -Path $signingDirectory | Out-Null
if (-not (Test-Path -LiteralPath $signingFile)) {
    $bytes = New-Object byte[] 32
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    $random.GetBytes($bytes)
    $random.Dispose()
    $password = [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
    @{ keystore = (Join-Path $signingDirectory 'service360-release.keystore'); storePassword = $password; keyPassword = $password; alias = 'service360' } | ConvertTo-Json | Set-Content -LiteralPath $signingFile
}
$signing = Get-Content -LiteralPath $signingFile -Raw | ConvertFrom-Json
$env:SERVICE360_KEYSTORE = $signing.keystore
$env:SERVICE360_STORE_PASSWORD = $signing.storePassword
$env:SERVICE360_KEY_PASSWORD = $signing.keyPassword
$env:SERVICE360_RELEASE_BUILD = 'true'
$env:EXPO_PUBLIC_API_URL = $ApiUrl
$env:EXPO_PUBLIC_DEMO_MODE = 'false'
$env:NODE_ENV = 'production'
$env:CI = '1'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
try {
    if (-not (Test-Path -LiteralPath $signing.keystore)) {
        & (Join-Path $env:JAVA_HOME 'bin\keytool.exe') -genkeypair -storetype PKCS12 -keystore $signing.keystore -alias service360 -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Service360, OU=Mobile, O=Service360, C=IN' -storepass:env SERVICE360_STORE_PASSWORD -keypass:env SERVICE360_KEY_PASSWORD
        if ($LASTEXITCODE -ne 0) { throw 'Signing key generation failed.' }
    }
    Push-Location $PSScriptRoot
    try {
        node node_modules/expo/bin/cli prebuild --platform android --no-install
        if ($LASTEXITCODE -ne 0) { throw 'Expo prebuild failed.' }
        Push-Location android
        try {
            $gradleArguments = @('assembleRelease','--no-daemon','--max-workers=2','-PreactNativeArchitectures=arm64-v8a,armeabi-v7a')
            if ($GradleInitScript) { $gradleArguments += @('--init-script', [IO.Path]::GetFullPath($GradleInitScript)) }
            & .\gradlew.bat @gradleArguments
            if ($LASTEXITCODE -ne 0) { throw 'Android release build failed.' }
        } finally { Pop-Location }
        $releaseDirectory = Join-Path $root 'releases'
        New-Item -ItemType Directory -Force -Path $releaseDirectory | Out-Null
        $version = (Get-Content -LiteralPath app.json -Raw | ConvertFrom-Json).expo.version
        $destination = Join-Path $releaseDirectory "Service360-$version.apk"
        Copy-Item -LiteralPath 'android\app\build\outputs\apk\release\app-release.apk' -Destination $destination
        Write-Host "APK: $destination"
        Get-FileHash -LiteralPath $destination -Algorithm SHA256
    } finally { Pop-Location }
} finally {
    Remove-Item Env:SERVICE360_STORE_PASSWORD,Env:SERVICE360_KEY_PASSWORD -ErrorAction SilentlyContinue
}
