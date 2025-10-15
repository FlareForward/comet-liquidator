# Fix Oracle Configuration and Restart Bot
# This script fixes the oracle misconfiguration issue by pointing to the correct oracle
$ErrorActionPreference = "Stop"

Write-Host "Fixing Oracle Configuration..." -ForegroundColor Yellow

# Stop the bot if running
Write-Host "Stopping liquidator bot..." -ForegroundColor Cyan
pm2 stop liquidator 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Bot stopped" -ForegroundColor Green
} else {
    Write-Host "[INFO] Bot was not running" -ForegroundColor Gray
}

# ===== ORACLE CONFIGURATION =====
# Use the correct Comptroller oracle (verified address)
Write-Host "" 
Write-Host "Setting oracle configuration..." -ForegroundColor Cyan
$env:KINETIC_ORACLE="0xbF4C24C256d78a184FC7D7F2De061278fA504145"
$env:ORACLE_MODE="compound"

# ===== DISCOVERY & PRICING =====
# Ensure chain-only pricing (no subgraph for price data)
Write-Host "Configuring discovery strategy..." -ForegroundColor Cyan
$env:USE_SUBGRAPH="false"
$env:HF_SOURCE="chain"

# ===== VALIDATION =====
Write-Host "" 
Write-Host "Configuration Applied:" -ForegroundColor Green
Write-Host "   KINETIC_ORACLE:  $env:KINETIC_ORACLE" -ForegroundColor White
Write-Host "   ORACLE_MODE:     $env:ORACLE_MODE" -ForegroundColor White
Write-Host "   HF_SOURCE:       $env:HF_SOURCE" -ForegroundColor White
Write-Host "   USE_SUBGRAPH:    $env:USE_SUBGRAPH" -ForegroundColor White

# ===== START BOT =====
Write-Host "" 
Write-Host "Starting liquidator bot with correct oracle..." -ForegroundColor Cyan
Set-Location -Path "packages\flare-kinetic-liquidator"

# Check if dist/main.js exists
if (-Not (Test-Path "dist\main.js")) {
    Write-Host "[ERROR] Bot not built. Run 'npm run build' first." -ForegroundColor Red
    exit 1
}

# Option to use pm2 or direct node
$usePm2 = $true

if ($usePm2) {
    # Check if pm2 is installed
    $pm2Installed = Get-Command pm2 -ErrorAction SilentlyContinue
    if (-Not $pm2Installed) {
        Write-Host "[WARNING] pm2 not installed. Install with: npm install -g pm2" -ForegroundColor Yellow
        Write-Host "Starting with node instead..." -ForegroundColor Gray
        node dist\main.js
    } else {
        # Start with pm2 and update environment
        pm2 start dist\main.js --name liquidator --update-env
        Write-Host "" 
        Write-Host "[OK] Bot started with pm2" -ForegroundColor Green
        Write-Host "View logs: pm2 logs liquidator" -ForegroundColor Gray
        Write-Host "Stop bot:  pm2 stop liquidator" -ForegroundColor Gray
    }
} else {
    # Direct node execution
    node dist\main.js
}

Write-Host "" 
Write-Host "[OK] Oracle fix applied!" -ForegroundColor Green
Write-Host "The bot now uses the correct oracle: 0xbF4C24C256d78a184FC7D7F2De061278fA504145" -ForegroundColor White

