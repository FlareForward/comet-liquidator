# Start the bot with Windows-safe env and logs
$ErrorActionPreference = "Stop"
Set-Location -Path "packages\flare-kinetic-liquidator"
$env:ORACLE_MODE="compound"
$env:HF_SOURCE="chain"
$env:LOG_LEVEL="debug"
$env:SIMULATE="true"
if (-Not (Test-Path node_modules)) { npm i }
node dist\main.js


