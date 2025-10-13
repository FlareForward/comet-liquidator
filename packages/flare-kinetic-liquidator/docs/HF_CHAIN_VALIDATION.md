# On-Chain HF Validation - Fixed

## What Was Wrong

The validator was:
- ❌ Iterating through ALL markets for every candidate (expensive)
- ❌ Not actually checking if users had debt on-chain
- ❌ Short-circuiting based on subgraph data
- ❌ Making 0 RPC calls but labeling hundreds as "no_debt"

## What's Fixed

Now the validator:
- ✅ Uses `getAssetsIn(user)` to get only user's markets
- ✅ Uses `getAccountSnapshot(cToken)` to read actual borrow balances on-chain
- ✅ Uses `getAccountLiquidity(user)` to determine if liquidatable
- ✅ Tracks RPC calls per batch
- ✅ Logs detailed validation flow for each candidate
- ✅ Asserts `HF_SOURCE=chain` on startup
- ✅ Aborts if RPC calls = 0 but candidates processed > 0

## Validation Flow (Per Candidate)

```
1. Check denylist (early exit if denied)
   ↓
2. getAssetsIn(user)                     [1 RPC]
   → If 0 markets: log "no_assets_in", exit
   ↓
3. For each cToken in assetsIn:
   getAccountSnapshot(cToken)             [N RPC, N = assetsIn.length]
   → Returns: (error, cTokenBalance, borrowBalance, exchangeRate)
   → Use index [2] for borrowBalance
   ↓
4. Sum all borrows
   → If totalBorrow = 0: log "no_debt_chain", exit
   ↓
5. getAccountLiquidity(user)             [1 RPC]
   → Returns: (error, liquidity, shortfall)
   → shortfall > 0 = liquidatable (HF < 1.0)
   → shortfall = 0 = healthy
   ↓
6. If shortfall > 0: LIQUIDATABLE
   HF ≈ liquidity / (liquidity + shortfall)
```

**Total RPC per candidate:** 2 + N (where N = markets user is in, typically 1-6)

## Expected Startup Logs

```json
{"event":"init_start","HF_SOURCE":"chain","candidate_source":"subgraph"}
{"event":"denylist_loaded","count":0}
{"event":"valid_proxy_found","addr":"0x...","oracle":"0x..."}
{"event":"markets_discovered","count":6,"markets":["0x...","0x...","..."]}
{"event":"bot_ready","comptroller":"0x...","oracle":"0x...","closeFactor":"0.5000","liqIncentive":"1.0800","markets":6,"HF_SOURCE":"chain","candidate_source":"subgraph"}
```

## Expected Runtime Logs (Per Candidate)

### Candidate with no markets
```json
{"event":"[OnChainValidator] 0xABCD...: no_assets_in (not using any markets)"}
```

### Candidate with markets but no debt
```json
{"event":"[OnChainValidator] 0xABCD...: no_debt_chain (assetsIn=2, borrows=0)"}
```

### Candidate with debt and healthy
```json
{"event":"[OnChainValidator] 0xABCD...: has_debt (assetsIn=3, raw_borrows=1000000000000000000)"}
{"event":"[OnChainValidator] 0xABCD...: healthy (liquidity=5000000000000000000, shortfall=0)"}
```

### Candidate liquidatable
```json
{"event":"[OnChainValidator] 0xABCD...: has_debt (assetsIn=2, raw_borrows=500000000000000000)"}
{"event":"[OnChainValidator] 0xABCD...: LIQUIDATABLE (HF=0.8500, shortfall=100000000000000000)"}
{"event":"liquidatable_found","borrower":"0xABCD...","healthFactor":"0.8500","shortfall":"100000000000000000","liquidity":"500000000000000000","assetsIn":2}
```

## Expected Batch Summary

```json
{
  "event":"validation_batch_complete",
  "candidates_checked":150,
  "liquidatable_found":2,
  "rpc_calls":420,
  "avg_rpc_per_candidate":"2.80"
}
```

**Key metric:** `rpc_calls > 0` (should be > 2x candidates_checked minimum)

## Critical Error Guard

If you see this, something is very wrong:

```json
{
  "event":"CRITICAL_ERROR",
  "message":"Processed candidates but made 0 RPC calls - HF chain validation is NOT working!",
  "candidates_processed":150
}
```

This means:
- The validator is exiting early without making RPC calls
- Check if `getAssetsIn()` is failing
- Check if denylist is filtering everything

## Sample Address Validation

To validate one specific address, look for logs like:

```json
// Step 1: Assets in
{"event":"[OnChainValidator] 0x1234...: getAssetsIn returned [0xABCD..., 0xEF01...]"}

// Step 2: Snapshots per cToken
{"event":"[OnChainValidator] 0x1234...: snapshot for 0xABCD... → borrow=1000000000000000000"}
{"event":"[OnChainValidator] 0x1234...: snapshot for 0xEF01... → borrow=0"}

// Step 3: Total borrows
{"event":"[OnChainValidator] 0x1234...: has_debt (assetsIn=2, raw_borrows=1000000000000000000)"}

// Step 4: Liquidity check
{"event":"[OnChainValidator] 0x1234...: getAccountLiquidity → (error=0, liquidity=5e18, shortfall=0)"}
```

## Verification Checklist

After running the bot, verify:

1. ✅ `[BOOT] HF_SOURCE: chain` in logs
2. ✅ `[BOOT] markets_discovered: count > 0` in logs
3. ✅ `[BOOT] Comptroller=0x...` and `Oracle=0x...` logged
4. ✅ Per candidate: see "has_debt", "no_debt_chain", "no_assets_in", "healthy", or "LIQUIDATABLE"
5. ✅ Batch summary: `rpc_calls > 0` (should be 2-8x candidates checked)
6. ✅ No CRITICAL_ERROR about 0 RPC calls

## Common Issues

### Issue: "0 RPC calls but 200 candidates processed"

**Cause:** Validator exiting early, not reaching on-chain calls

**Fix:** Already fixed - now uses `getAssetsIn()` first

### Issue: "All candidates labeled no_debt but subgraph shows borrows"

**Cause:** Wrong ABI or calling snapshots on wrong addresses

**Fix:** Already fixed - uses correct `getAccountSnapshot` ABI, calls on cTokens not underlyings

### Issue: "Oracle price = 0"

**Cause:** Wrong oracle address or oracle malfunction

**Fix:** Check startup logs for `Oracle=0x...`, verify it's correct

### Issue: "getAccountSnapshot returns error != 0"

**Cause:** Invalid cToken address or market not entered

**Fix:** Already handled - logs warning and continues

## Testing Commands

### Test with specific address

```powershell
# In your .env, temporarily set:
$env:CANDIDATE_LIMIT="1"
$env:USE_SUBGRAPH="false"
$env:TEST_ADDRESS="0x..." # manually add to candidate list
```

### Enable verbose logging

```powershell
$env:LOG_LEVEL="debug"
```

### Verify RPC calls are happening

Watch for:
- `rpc_calls: N` where N > 0
- Individual candidate logs showing `assetsIn=[...]`, `borrows=...`

## Windows Environment (Your Setup)

```powershell
$env:HF_SOURCE="chain"
$env:CANDIDATE_SOURCE="subgraph"
$env:SUBGRAPH_PAGE_SIZE="1000"
$env:USE_SUBGRAPH="true"
pm2 restart liquidator --update-env
pm2 logs liquidator --lines 100
```

## Summary of Changes

### OnChainValidator.ts
- ✅ Removed market iteration (was checking ALL 6 markets for every user)
- ✅ Added `getAssetsIn(user)` to get only user's markets
- ✅ Added `getAccountSnapshot` per cToken to read actual borrows
- ✅ Added `getAccountLiquidity` for shortfall check
- ✅ Added RPC call counter
- ✅ Added detailed per-candidate logging
- ✅ Asserts HF_SOURCE=chain on construction

### LiquidationBot.ts
- ✅ Added HF_SOURCE assertion on init
- ✅ Added markets discovery verification (fails if 0)
- ✅ Added batch RPC call logging
- ✅ Added critical error guard for 0 RPC calls
- ✅ Logs comptroller + oracle on startup

## Expected Performance

| Candidates | RPC Calls | Time |
|-----------|-----------|------|
| 10 | 30-80 | ~1-3s |
| 50 | 150-400 | ~5-15s |
| 150 | 450-1200 | ~15-45s |

**RPC calls per candidate:** 2 + N (N = assetsIn count)

If you see significantly fewer RPC calls than candidates, validation is short-circuiting.

