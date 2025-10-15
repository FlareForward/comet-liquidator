# Start the bot with Windows-safe env and logs
$ErrorActionPreference = "Stop"
Set-Location -Path "packages\flare-kinetic-liquidator"

# ===== ORACLE CONFIGURATION =====
# Use the correct Comptroller oracle (verified and validated)
$env:KINETIC_ORACLE="0xbF4C24C256d78a184FC7D7F2De061278fA504145"
$env:ORACLE_MODE="compound"

# ===== HEALTH FACTOR & DISCOVERY =====
$env:HF_SOURCE="chain"
$env:USE_SUBGRAPH="false"

# ===== BOT SETTINGS =====
$env:LOG_LEVEL="debug"
$env:SIMULATE="true"

# ===== START BOT =====
if (-Not (Test-Path node_modules)) { npm i }
node dist\main.js


