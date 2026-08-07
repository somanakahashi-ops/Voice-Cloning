# 声の記憶帳バックエンド常駐スクリプト(タスクスケジューラ VoiceCloningBackend から起動)
# uvicornを起動し、落ちたら15秒後に自動再起動する。二重起動はポート8000の確認で防ぐ。
# --host 0.0.0.0 でLAN内の他端末(スマホ等)からもアクセスできるようにしている。
# 認証は一切ないため、信頼できる自宅/オフィスのWiFiでのみ使うこと(公衆WiFi等では使わない)。
$dir = $PSScriptRoot
$log = "$dir\voice-cloning-backend-log.txt"
$outLog = "$dir\voice-cloning-backend-out.log"
$errLog = "$dir\voice-cloning-backend-err.log"
$py = Join-Path $dir "..\backend\.venv\Scripts\python.exe"
$workdir = Join-Path $dir "..\backend"

function Write-Log($msg) {
    Add-Content -Path $log -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
}

# 既にポート8000で動いていれば何もしない
try {
    $c = New-Object Net.Sockets.TcpClient
    $c.Connect("127.0.0.1", 8000)
    $c.Close()
    Write-Log "already running on port 8000; exit"
    exit 0
} catch {}

Write-Log "supervisor start"
while ($true) {
    foreach ($f in @($outLog, $errLog)) {
        if ((Test-Path $f) -and ((Get-Item $f).Length -gt 5MB)) { Clear-Content $f }
    }
    $p = Start-Process -FilePath $py `
        -ArgumentList "-m","uvicorn","main:app","--host","0.0.0.0","--port","8000","--log-level","warning" `
        -WorkingDirectory $workdir -WindowStyle Hidden `
        -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru
    Write-Log "uvicorn started pid=$($p.Id)"
    $p.WaitForExit()
    Write-Log "uvicorn exited code=$($p.ExitCode); restarting in 15s"
    Start-Sleep -Seconds 15
}
