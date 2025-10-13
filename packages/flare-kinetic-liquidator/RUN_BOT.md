# Quick Reference - Running the Flare Kinetic Liquidator

## 🚀 Run Commands

### Option 1: From Repo Root (Recommended)
```powershell
# Set environment variables
$env:CANDIDATE_SOURCE="chain"
$env:SCAN_LOOKBACK_BLOCKS="6000"
$env:BLOCK_CHUNK="30"
$env:SIMULATE="true"
$env:EXECUTE="false"
$env:DEBUG_CANDIDATES="0"
$env:FLASH_EXECUTOR_V3="0x48FdaA7C55764e47247f075Eb6DA14A7342E11e8"
$env:COMPTROLLER="0x8041680Fb73E1Fe5F851e76233DCDfA0f2D2D7c8"
$env:UNITROLLER_LIST="0x8041680Fb73E1Fe5F851e76233DCDfA0f2D2D7c8,0x15F69897E6aEBE0463401345543C26d1Fd994abB"

# Run bot
node packages\flare-kinetic-liquidator\dist\src\main.js
```

### Option 2: From Package Directory
```powershell
cd packages\flare-kinetic-liquidator

# Set environment variables (same as above)
$env:CANDIDATE_SOURCE="chain"
$env:SCAN_LOOKBACK_BLOCKS="6000"
$env:BLOCK_CHUNK="30"
$env:SIMULATE="true"
$env:EXECUTE="false"
$env:FLASH_EXECUTOR_V3="0x48FdaA7C55764e47247f075Eb6DA14A7342E11e8"
$env:COMPTROLLER="0x8041680Fb73E1Fe5F851e76233DCDfA0f2D2D7c8"
$env:UNITROLLER_LIST="0x8041680Fb73E1Fe5F851e76233DCDfA0f2D2D7c8,0x15F69897E6aEBE0463401345543C26d1Fd994abB"

# Run bot
node dist\src\main.js
```

### Option 3: Run TypeScript Directly (No Build)
```powershell
cd packages\flare-kinetic-liquidator

# Set environment variables (same as above)
$env:CANDIDATE_SOURCE="chain"
# ... etc

# Run with ts-node
npx ts-node src\main.ts
```

---

## 🔍 Debug Mode

To see individual borrower addresses being discovered:

```powershell
$env:DEBUG_CANDIDATES="1"
node packages\flare-kinetic-liquidator\dist\src\main.js
```

This will print each borrower found from Borrow and LiquidateBorrow events.

---

## ✅ What to Look For

### 1. Successful Startup
```json
{"event":"valid_proxy_found","addr":"0x8041...","oracle":"0xbF4C..."}
{"event":"bot_ready","comptroller":"0x8041...","markets":6,"simulate":true}
```

### 2. Chain Discovery Working
```
[ChainSweep] Scanning 6 markets from block 48978476 to 48984476 (initial chunk=30)
[ChainSweep] 0xDEe...: found 5 Borrow + 2 LiquidateBorrow events in blocks 48980000-48980030
[ChainSweep] RPC block limit hit, reducing chunk from 30 to 15
[ChainSweep] Total unique borrowers found: 42
```

### 3. Candidates Found
```json
{"event":"chain_candidates_found","count":42}
{"event":"total_candidates","count":42}
```

### 4. Validation and Liquidatable Positions
```json
{"event":"liquidatable_found","borrower":"0xabc...","healthFactor":"0.9850","markets":2}
{"event":"simulate_liquidation","borrower":"0xabc...","debtToken":"0x1e5b...","collToken":"0x2914...","repayAmount":"500000"}
```

---

## 🎯 Go Live Checklist

Before setting `EXECUTE=true`:

- [ ] Bot runs without errors for multiple cycles
- [ ] Chain discovery finds borrowers (`chain_candidates_found` > 0)
- [ ] At least one position validates as liquidatable
- [ ] PnL estimates show `profitable=true` for at least one candidate
- [ ] Gas prices are reasonable (no `gas_too_high` messages)
- [ ] Contract is not paused (run `scripts/admin/readState.ts`)
- [ ] You have sufficient FLR for gas in deployer wallet

### Go Live Command
```powershell
$env:SIMULATE="false"
$env:EXECUTE="true"
$env:MAX_LIQUIDATIONS="1"
node packages\flare-kinetic-liquidator\dist\src\main.js
```

---

## 📊 Key Environment Variables

| Variable | Value | Purpose |
|----------|-------|---------|
| `CANDIDATE_SOURCE` | `chain` | Use on-chain event scanning |
| `BLOCK_CHUNK` | `30` | Chunk size (auto-adjusts) |
| `SCAN_LOOKBACK_BLOCKS` | `6000` | How many blocks to scan |
| `SIMULATE` | `true` | Dry run mode (no txs) |
| `EXECUTE` | `false` | Actually send transactions |
| `DEBUG_CANDIDATES` | `0` or `1` | Print borrower addresses |
| `MAX_LIQUIDATIONS` | `1` | Limit per cycle |
| `MIN_HEALTH_FACTOR` | `1.1` | Only liquidate HF < this |
| `MIN_PROFIT_USD` | `50` | Minimum profit threshold |

---

## 🛠️ Troubleshooting

### No Candidates Found
- Increase `SCAN_LOOKBACK_BLOCKS` (try 12000)
- Enable `DEBUG_CANDIDATES=1` to see if events are being found
- Check that markets actually have borrowers on Flare

### RPC Errors Continue
- Adaptive chunking should handle this automatically
- If issues persist, manually set `BLOCK_CHUNK=15` or lower
- Check Flare RPC status

### Bot Crashes or Hangs
- Check logs for specific error messages
- Ensure `.env` has all required variables
- Verify RPC connection is working
- Try reducing `SCAN_LOOKBACK_BLOCKS`

---

## 📝 Log Locations

- **Console Output:** Real-time structured JSON logs
- **Package Directory:** `packages/flare-kinetic-liquidator/`
- **Compiled Code:** `packages/flare-kinetic-liquidator/dist/src/`

---

## 🎉 Success Indicators

✅ Markets loaded (should show 6)  
✅ Borrowers discovered from events  
✅ Health factors calculated  
✅ Candidates validated  
✅ Profitable positions identified  
✅ Liquidations executed (in live mode)  
✅ Profits arrive at beneficiary  

---

**Contract:** `0x48FdaA7C55764e47247f075Eb6DA14A7342E11e8`  
**Beneficiary:** `0x492CF24a0162Bcd72265d4b7542836A5593d62Ac`  
**Network:** Flare Mainnet  

