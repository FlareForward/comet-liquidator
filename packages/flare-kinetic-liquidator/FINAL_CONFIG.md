# Final Configuration Guide - Flare Kinetic Liquidator

## ✅ Deployment Complete

**Contract Address:** `0x48FdaA7C55764e47247f075Eb6DA14A7342E11e8`  
**Network:** Flare Mainnet  
**Status:** Deployed and verified  
**Bot Status:** Fully operational with chain-based discovery

---

## Required Environment Variables

Add these to your `.env` file in the repo root:

```env
# === Deployed Contract ===
FLASH_EXECUTOR_V3=0x48FdaA7C55764e47247f075Eb6DA14A7342E11e8

# === Network ===
RPC_URL=https://flare-api.flare.network/ext/C/rpc
DEPLOYER_KEY=0xYOUR_PRIVATE_KEY_HERE

# === Comptroller (Use Unitroller Proxy) ===
COMPTROLLER=0x8041680Fb73E1Fe5F851e76233DCDfA0f2D2D7c8
UNITROLLER_LIST=0x8041680Fb73E1Fe5F851e76233DCDfA0f2D2D7c8,0x15F69897E6aEBE0463401345543C26d1Fd994abB

# === Candidate Discovery ===
CANDIDATE_SOURCE=chain
BLOCK_CHUNK=30
SCAN_LOOKBACK_BLOCKS=6000

# === DEX Configuration ===
V3_FACTORY=0x8A2578d23d4C532cC9A98FaD91C0523f5efDE652
DEX_ROUTER=0x8a1E35F5c98C4E85B36B7B253222eE17773b2781
PRIMARY_FLASH_FALLBACK=0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d
PAYOUT_QUOTE_TOKEN=0xe7cd86e13AC4309349F30B3435a9d337750fC82D

# === Safety Parameters ===
MIN_HEALTH_FACTOR=1.1
MIN_PROFIT_USD=50
MAX_GAS_PRICE_GWEI=100
SLIPPAGE_BPS=30
FLASH_FEE_BPS=5

# === Bot Behavior ===
SIMULATE=true
EXECUTE=false
MAX_LIQUIDATIONS=1
CHECK_INTERVAL=30000

# === Tokens ===
WFLR=0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d
USDT0=0xe7cd86e13AC4309349F30B3435a9d337750fC82D
```

---

## Running the Bot

### 1. Test in Simulate Mode (DRY RUN)

```powershell
cd packages\flare-kinetic-liquidator

# Test discovery and validation without executing
$env:SIMULATE="true"
$env:EXECUTE="false"
node dist\src\main.js
```

**What to expect:**
- Bot loads configuration
- Finds valid Unitroller proxy
- Scans on-chain Borrow events (adaptive chunking)
- Validates candidates on-chain
- Simulates liquidations (no transactions)
- Logs structured JSON output

### 2. Go Live (PRODUCTION)

**⚠️ IMPORTANT: Test thoroughly in simulate mode first!**

```powershell
cd packages\flare-kinetic-liquidator

# LIVE MODE - Will execute real liquidations!
$env:SIMULATE="false"
$env:EXECUTE="true"
$env:MAX_LIQUIDATIONS="1"
node dist\src\main.js
```

### 3. Scaling Up

Once comfortable, gradually increase throughput:

```powershell
$env:MAX_LIQUIDATIONS="5"           # Process up to 5 liquidations per cycle
$env:CHECK_INTERVAL="15000"         # Check every 15 seconds
$env:SCAN_LOOKBACK_BLOCKS="12000"   # Scan more blocks for candidates
```

---

## Key Features Implemented

### ✅ Smart Contract
- Uniswap V3 flash loan integration
- Automatic swap routing (SparkDEX)
- Compound V2 liquidation logic
- Immutable beneficiary for security
- Admin controls (pause, rescue, ownership)

### ✅ Chain-Based Discovery
- Scans `Borrow` events from all kToken markets
- **Adaptive chunking** automatically adjusts to RPC limits
- Starts at 30 blocks, shrinks on error, recovers on success
- No dependency on subgraph

### ✅ Safety Features
- **Unitroller proxy detection** - finds valid comptroller automatically
- **On-chain validation** - verifies health factors before executing
- **PnL estimation** - calculates profitability with slippage guards
- **Gas price caps** - skips liquidations if gas too high
- **Idempotence** - prevents duplicate processing
- **Minimum profit threshold** - only executes profitable liquidations

### ✅ Operational Excellence
- Structured JSON logging
- Error handling and retry logic
- Real-time health factor calculation
- Multiple liquidation pair selection
- Configurable check intervals

---

## Understanding the Bot Logs

### Startup Logs
```json
{"event":"valid_proxy_found","addr":"0x8041...","oracle":"0xbF4C..."}
{"event":"bot_ready","comptroller":"0x8041...","markets":6,"simulate":true}
```
✅ Comptroller connected, oracle resolved, markets loaded

### Discovery Logs
```json
{"event":"subgraph_candidates","count":0}
{"event":"chain_fallback_triggered"}
{"event":"chain_sweep_start","fromBlock":48978476,"toBlock":48984476}
[ChainSweep] Scanning 6 markets from block 48978476 to 48984476 (initial chunk=30)
[ChainSweep] RPC block limit hit, reducing chunk from 30 to 15
[ChainSweep] 0xDEe...: found 3 Borrow events in blocks 48980000-48980015
[ChainSweep] Total unique borrowers found: 25
{"event":"chain_candidates_found","count":25}
```
✅ Chain discovery working, adaptive chunking active

### Validation Logs
```json
{"event":"liquidatable_found","borrower":"0xabc...","healthFactor":"0.9850","markets":2}
```
✅ Found unhealthy position

### Execution Logs (Live Mode)
```json
{"event":"executing_liquidation","borrower":"0xabc...","repayAmount":"1000000","estimatedPnlUsd":75.5}
{"event":"liquidation_success","tx":"0x123...","gasUsed":"350000","blockNumber":48984500}
```
✅ Liquidation executed successfully

---

## Troubleshooting

### No Candidates Found
**Symptoms:** `chain_candidates_found: 0`

**Solutions:**
- Increase `SCAN_LOOKBACK_BLOCKS` (try 12000 or 20000)
- Check that markets are active and have borrowers
- Verify RPC connection is working

### All Candidates Unprofitable
**Symptoms:** `skip_unprofitable` for all candidates

**Solutions:**
- Lower `MIN_PROFIT_USD` for testing (try 10)
- Check DEX has sufficient liquidity for swaps
- Verify `SLIPPAGE_BPS` isn't too conservative
- Check `FLASH_FEE_BPS` is reasonable

### RPC Errors
**Symptoms:** `requested too many blocks` errors

**Solutions:**
- ✅ **Already handled!** Adaptive chunking will automatically reduce chunk size
- If persists, manually set `BLOCK_CHUNK=15` or lower
- Consider using a private RPC endpoint with higher limits

### Gas Too High
**Symptoms:** `gas_too_high` messages

**Solutions:**
- Increase `MAX_GAS_PRICE_GWEI` in `.env`
- Wait for lower gas periods on Flare
- Monitor Flare gas prices: https://flarescan.com/

---

## Admin Commands

### Check Contract State
```powershell
$env:FLASH_EXECUTOR_V3="0x48FdaA7C55764e47247f075Eb6DA14A7342E11e8"
npx hardhat run scripts\admin\readState.ts --network flare
```

### Pause Contract (Emergency)
```powershell
$env:FLASH_EXECUTOR_V3="0x48FdaA7C55764e47247f075Eb6DA14A7342E11e8"
$env:PAUSE="true"
npx hardhat run scripts\admin\setPaused.ts --network flare
```

### Resume Contract
```powershell
$env:PAUSE="false"
npx hardhat run scripts\admin\setPaused.ts --network flare
```

---

## Performance Tuning

### For High Activity Markets
```env
CHECK_INTERVAL=10000              # Check every 10 seconds
MAX_LIQUIDATIONS=10               # Process up to 10 per cycle
SCAN_LOOKBACK_BLOCKS=20000        # Wider scan window
MIN_PROFIT_USD=25                 # Lower threshold for more opportunities
```

### For Conservative/Safe Operation
```env
CHECK_INTERVAL=60000              # Check every minute
MAX_LIQUIDATIONS=1                # One at a time
SCAN_LOOKBACK_BLOCKS=3000         # Recent blocks only
MIN_PROFIT_USD=100                # Higher profit threshold
MIN_HEALTH_FACTOR=1.05            # Only liquidate very unhealthy positions
```

### For Rate-Limited RPCs
```env
BLOCK_CHUNK=15                    # Smaller chunks
SCAN_LOOKBACK_BLOCKS=3000         # Fewer blocks
CHECK_INTERVAL=45000              # Less frequent checks
```

---

## Monitoring Checklist

- [ ] Bot is discovering candidates (check `chain_candidates_found` > 0)
- [ ] Candidates are being validated (check `liquidatable_found` events)
- [ ] PnL calculations are reasonable (check `estimatedPnlUsd`)
- [ ] Gas prices are acceptable (no `gas_too_high` messages)
- [ ] Profits are arriving at beneficiary address
- [ ] No repeated errors in logs
- [ ] Health factors are calculated correctly
- [ ] Swap routes are working (check DEX liquidity)

---

## Next Steps

1. **Monitor First Cycle** - Let bot run in simulate mode, verify it finds candidates
2. **Test One Liquidation** - Set `MAX_LIQUIDATIONS=1`, `EXECUTE=true`, execute one liquidation
3. **Verify Profit** - Check that profit arrived at beneficiary (`0x492CF24a0162Bcd72265d4b7542836A5593d62Ac`)
4. **Scale Gradually** - Increase `MAX_LIQUIDATIONS` and decrease `CHECK_INTERVAL`
5. **Monitor Performance** - Watch logs, adjust parameters based on market conditions

---

## Support Documentation

- **README.md** - Comprehensive setup guide
- **DEPLOYMENT_SUCCESS.md** - Deployment details and contract info
- **DEPLOYMENT_GUIDE.md** - Step-by-step deployment instructions
- **QUICKSTART.md** - Fast setup for experienced users
- **RUNBOOK.md** - Operational procedures and incident response
- **IMPLEMENTATION.md** - Technical architecture details

---

**Deployment Date:** October 13, 2025  
**Version:** 1.0.0  
**Status:** ✅ Production Ready  
**Bot Features:** Chain discovery, adaptive chunking, auto-backoff, full safety guards

