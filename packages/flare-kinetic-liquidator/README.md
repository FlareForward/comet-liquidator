# Flare Kinetic Liquidator

Production-ready Compound-v2 (Kinetic) liquidator for Flare Network with Uniswap-v3 flash loans via SparkDEX/Enosys.

## Architecture

- **Solidity Executor**: `FlashLiquidatorV3.sol` - Flash loan + liquidate + repay + profit extraction
- **TypeScript Bot**: Main loop with subgraph candidate discovery, on-chain validation, PnL estimation, and safety guards
- **Windows-Safe**: All scripts use PowerShell (no `&&` or bash)

## Features

✅ Real-time health factor calculation from on-chain data  
✅ Slippage protection via DEX router quotes  
✅ Gas price safety guards  
✅ Idempotence (60s dedup window)  
✅ JSON structured logging  
✅ Profitability estimation before execution  
✅ Multi-fee-tier Uniswap v3 pool discovery  

## Setup

1. Set these vars in your `.env` at repo root:

```env
RPC_URL=https://flare-api.flare.network/ext/C/rpc
KINETIC_COMPTROLLER=0xeC7e541375D70c37262f619162502dB9131d6db5
SUBGRAPH_URL=https://api.goldsky.com/api/public/project_cmg5ltyqo0x8v01us07lih2dr/subgraphs/kinetic-liquidations/1.0.12/gn
V3_FACTORY=0x8A2578d23d4C532cC9A98FaD91C0523f5efDE652
DEX_ROUTER=0x8a1E35F5c98C4E85B36B7B253222eE17773b2781
V3_FEE_CANDIDATES=100,500,3000
DEPLOYER_KEY=0xYOUR_PRIVATE_KEY
PAYOUT_TOKEN_BENEFICIARY=0xYourEOA
MIN_HEALTH_FACTOR=1.1
MIN_PROFIT_USD=50
MAX_GAS_PRICE_GWEI=100
SLIPPAGE_BPS=30
FLASH_FEE_BPS=5
CHECK_INTERVAL=30000
SIMULATE=true
EXECUTE=false
MAX_LIQUIDATIONS=1
```

2. Deploy the flash executor:

```powershell
npm run deploy:flash
```

3. Copy the printed `FLASH_EXECUTOR_V3` address and add to `.env`.

4. Build and run the bot:

```powershell
npm run build:flare
npm run start:flare
```

## Scripts

- `npm run build:flare` - Compile TypeScript
- `npm run deploy:flash` - Deploy FlashLiquidatorV3 (Windows PS)
- `npm run start:flare` - Run the bot (Windows PS)

## How It Works

1. **Candidate Discovery**: Subgraph returns accounts with borrows
2. **On-Chain Validation**: Reads actual health factor from Comptroller/Oracle
3. **Profitability Check**: Estimates profit after flash fees and slippage (TODO)
4. **Execution**: Calls FlashLiquidatorV3 with optimal debt/collateral pair
5. **Flash Flow**:
   - Borrow flash token from Uniswap v3 pool
   - Swap to debt token (if needed)
   - Call `liquidateBorrow` on kToken
   - Redeem seized collateral
   - Swap back to flash token
   - Repay flash + fee
   - Send profit to beneficiary

## Files

- `contracts/FlashLiquidatorV3.sol` - Flash executor
- `src/adapters/` - Comptroller and CToken wrappers
- `src/services/` - Price and health factor logic
- `src/sources/` - Subgraph candidate fetcher
- `src/dex/` - Uniswap v3 pool discovery
- `src/strategy/` - Flash repay strategy
- `src/bot/` - Main bot loop and validator
- `src/main.ts` - Entry point

## Deployment Steps

### 1. Configure Environment

Edit `.env` with your private key and beneficiary address:

```powershell
$env:DEPLOYER_KEY="0xYOURKEY"
$env:PAYOUT_TOKEN_BENEFICIARY="0xYourEOA"
```

### 2. Deploy Flash Executor

```powershell
npm run deploy:flash
```

Copy the printed `FLASH_EXECUTOR_V3` address and add to `.env`:

```env
FLASH_EXECUTOR_V3=0xDeployedAddress
```

### 3. Build TypeScript

```powershell
npm run build:flare
```

### 4. Dry Run (Simulate Mode)

```powershell
$env:SIMULATE="true"
$env:EXECUTE="false"
$env:MAX_LIQUIDATIONS="1"
npm run start:flare
```

**Verify:**
- Oracle resolves and returns valid prices
- Health factors compute correctly
- At least one candidate shows as liquidatable
- PnL estimation shows positive profit

### 5. Live Execution

```powershell
$env:SIMULATE="false"
$env:EXECUTE="true"
$env:MAX_LIQUIDATIONS="1"
$env:CHECK_INTERVAL="15000"
npm run start:flare
```

**Monitor logs for:**
- `liquidation_success` events with tx hash
- `pnlUsd` in profit range
- Gas usage within acceptable limits

### 6. Scale Up

After successful test liquidations:

```powershell
$env:MAX_LIQUIDATIONS="3"
$env:MIN_PROFIT_USD="25"
$env:CHECK_INTERVAL="10000"
```

## Safety Features

✅ **Gas Price Cap**: Skips if gas > `MAX_GAS_PRICE_GWEI`  
✅ **Oracle Kill-Switch**: Exits if oracle returns 0 or reverts  
✅ **Slippage Protection**: Guards swaps with `SLIPPAGE_BPS`  
✅ **Idempotence**: 60s dedup window prevents double-liquidations  
✅ **PnL Guard**: Only executes if profit ≥ `MIN_PROFIT_USD`  

## JSON Logging

All events logged as JSON for easy parsing:

```json
{"timestamp":"2025-10-13T...","event":"liquidation_success","borrower":"0x...","tx":"0x...","pnlUsd":75.5}
{"timestamp":"2025-10-13T...","event":"skip_unprofitable","borrower":"0x...","estimatedPnlUsd":15.2}
```

Parse with `jq` or stream to observability platform.

