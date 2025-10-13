# Usage: set $env:DEPLOYER_KEY then run:
#   pwsh packages/flare-kinetic-liquidator/scripts/deploy.ps1
$ErrorActionPreference = "Stop"
Set-Location -Path "packages/flare-kinetic-liquidator"
if (-Not (Test-Path node_modules)) { npm i }
npx hardhat compile --network flare
$beneficiary = $env:PAYOUT_TOKEN_BENEFICIARY
if (-Not $beneficiary) { Write-Error "Set PAYOUT_TOKEN_BENEFICIARY"; exit 1 }
$npxArgs = @("hardhat","run","scripts\deploy_flash.ts","--network","flare")
$env:FACTORY_V3 = $env:V3_FACTORY
$env:ROUTER_V2  = $env:DEX_ROUTER
$env:BENEFICIARY = $beneficiary
node .\node_modules\hardhat\internal\cli\bootstrap.js @npxArgs


