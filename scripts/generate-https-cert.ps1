# 自己署名HTTPS証明書を作る(SHA-256署名)。
#
# 目的: スマホ等LAN内の端末からアクセスした際にマイク(getUserMedia)を使えるようにする。
# ブラウザはHTTPS(またはlocalhost自身)でしかマイクを許可しないため、
# LAN IP経由のアクセスにはこの証明書が必要になる。
#
# 使い方: このスクリプトを1回実行するだけでよい(IPアドレスが変わったら再実行する)。
#   powershell -ExecutionPolicy Bypass -File scripts\generate-https-cert.ps1
#
# 生成された証明書はbackend\certs\に保存され、voice-cloning-backend.ps1が
# 自動的に検出してHTTPS(SSL)モードでuvicornを起動するようになる。
# backend\certs\はリポジトリにコミットしない(端末ごとに固有の秘密鍵のため)。

$ErrorActionPreference = "Stop"
$certDir = Join-Path $PSScriptRoot "..\backend\certs"
New-Item -ItemType Directory -Force -Path $certDir | Out-Null

# openssl.exeを探す(PATH → Git for Windows同梱 の順)
function Find-OpenSSL {
    $cmd = Get-Command openssl -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
        if (-not $base) { continue }
        $candidate = Join-Path $base "Git\usr\bin\openssl.exe"
        if (Test-Path $candidate) { return $candidate }
    }
    throw "openssl.exeが見つかりません。Git for Windows(https://git-scm.com/)をインストールしてください(opensslが同梱されています)。"
}
$openssl = Find-OpenSSL
Write-Host "openssl: $openssl"

# LAN側のIPv4アドレスを自動検出(ループバック・リンクローカルは除外)
$lanIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    Select-Object -First 1).IPAddress

if (-not $lanIp) {
    Write-Warning "LAN IPを自動検出できませんでした。127.0.0.1のみで証明書を作成します。"
    $lanIp = "127.0.0.1"
}
Write-Host "検出したLAN IP: $lanIp"
Write-Host "(このIPが変わった場合は、このスクリプトを再実行してください)"

$keyPath = Join-Path $certDir "key.pem"
$certPath = Join-Path $certDir "cert.pem"

$san = "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:$lanIp"

& $openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes `
    -keyout $keyPath -out $certPath `
    -subj "/CN=voice-cloning.local" `
    -addext $san

if ($LASTEXITCODE -ne 0) {
    throw "証明書の生成に失敗しました(opensslの終了コード: $LASTEXITCODE)"
}

Write-Host ""
Write-Host "証明書を作成しました: $certPath"
Write-Host "次回 start-app.bat を実行すると、自動的にHTTPSで起動します。"
Write-Host "スマホからは https://${lanIp}:8000/app/ にアクセスしてください。"
Write-Host "(自己署名証明書のため、初回アクセス時にブラウザの警告が出ます。「詳細設定」→「アクセスする」等で進めてください)"
