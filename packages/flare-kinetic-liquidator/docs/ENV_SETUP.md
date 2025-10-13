# Environment Variable Setup

## Your Configuration (✅ Ready to Use)

```powershell
$env:USE_SUBGRAPH="true"
$env:CANDIDATE_SOURCE="subgraph"
$env:SUBGRAPH_URL="https://api.goldsky.com/api/public/project_cmg5ltyqo0x8v01us07lih2dr/subgraphs/kinetic-liquidations/1.0.12/gn"
$env:SUBGRAPH_PAGE_SIZE="1000"
$env:SUBGRAPH_TIMEOUT_MS="6000"
$env:SUBGRAPH_RETRIES="5"
$env:CANDIDATE_LIMIT="0"
$env:HF_SOURCE="chain"
$env:CHAIN_FALLBACK_ON_EMPTY="1"
$env:CHAIN_SWEEP_LOOKBACK="0"
$env:BLOCKS_PER_CHUNK="5000"
$env:BLOCK_LOOKBACK="200000"
```

## What This Configuration Does

### Discovery Strategy
- ✅ **Subgraph-first**: Fetches borrowers from Goldsky in O(pages)
- ✅ **On-chain HF**: Calculates health factors from chain state
- ✅ **Chain sweep disabled**: `CHAIN_SWEEP_LOOKBACK=0` turns off periodic 30-block sweeps
- ✅ **Fallback enabled**: Only scans chain if subgraph returns 0 candidates

### Flow
```
1. Query subgraph (1000 per page, paginate through all)
2. De-duplicate addresses (lowercase)
3. Filter denylist
4. For each candidate:
   - getAssetsIn(borrower)
   - getAccountSnapshot() per market
   - Prices from Comptroller.oracle
   - Calculate HF on-chain
5. If HF < threshold → liquidate
```

## Expected Startup Logs

When you run the bot, you should see:

```
Starting Flare Kinetic Liquidator Bot...
Config: { rpcUrl: '...', comptroller: '0x...', ... }

=== Candidate Discovery Configuration ===
Using candidate source: subgraph
Subgraph enabled: true
Subgraph URL: https://api.goldsky.com/api/public/project_cmg5ltyqo0x8v01us07lih2dr/subgraphs/kinetic-liquidations/1.0.12/gn
Subgraph page size: 1000
Subgraph timeout: 6000ms
Subgraph retries: 5
Candidate limit: unlimited
HF source: chain
Chain sweep lookback: 0 blocks
Chain sweep disabled (periodic sweeps off)
Chain fallback on empty: enabled
Fallback will scan 200000 blocks in 5000-block chunks
==========================================
```

## Expected Runtime Logs

### Normal Operation (Subgraph Working)

```json
{"timestamp":"2025-10-13T...","event":"denylist_loaded","count":0}
{"timestamp":"2025-10-13T...","event":"bot_ready","comptroller":"0x...","oracle":"0x...","closeFactor":"0.5000","liqIncentive":"1.0800","markets":6,"simulate":true,"execute":false}
{"timestamp":"2025-10-13T...","event":"fetch_candidates_start","source":"subgraph","useSubgraph":true}
{"timestamp":"2025-10-13T...","event":"[SubgraphCandidates] Starting fetch with pageSize=1000"}
{"timestamp":"2025-10-13T...","event":"[SubgraphCandidates] Page skip=0: found 127 new borrowers (total: 127)"}
{"timestamp":"2025-10-13T...","event":"[SubgraphCandidates] Page skip=1000: found 43 new borrowers (total: 170)"}
{"timestamp":"2025-10-13T...","event":"[SubgraphCandidates] Fetch complete: 170 unique borrowers"}
{"timestamp":"2025-10-13T...","event":"subgraph_candidates","count":170}
{"timestamp":"2025-10-13T...","event":"total_candidates","count":170}
{"timestamp":"2025-10-13T...","event":"[OnChainValidator] Found 6 markets from comptroller"}
{"timestamp":"2025-10-13T...","event":"[ComptrollerAdapter] Detected 2-tuple markets() variant (Kinetic-style)"}
```

### If Subgraph Returns Zero (Fallback Triggered)

```json
{"timestamp":"2025-10-13T...","event":"fetch_candidates_start","source":"subgraph","useSubgraph":true}
{"timestamp":"2025-10-13T...","event":"subgraph_candidates","count":0}
{"timestamp":"2025-10-13T...","event":"chain_fallback_triggered","reason":"subgraph returned no candidates","willScan":"200000 blocks"}
{"timestamp":"2025-10-13T...","event":"chain_sweep_start","fromBlock":5800000,"toBlock":6000000,"markets":6,"chunkSize":5000}
{"timestamp":"2025-10-13T...","event":"chain_candidates_found","count":85}
```

### If Denylist Active

```json
{"timestamp":"2025-10-13T...","event":"denylist_loaded","count":22}
{"timestamp":"2025-10-13T...","event":"[SubgraphCandidates] Fetch complete: 148 unique borrowers"}
{"timestamp":"2025-10-13T...","event":"subgraph_candidates","count":148}
{"timestamp":"2025-10-13T...","event":"total_candidates","count":148}
```

## Verification Checklist

When the bot starts, confirm you see:

- ✅ `"Using candidate source: subgraph"`
- ✅ `"Subgraph page size: 1000"`
- ✅ `"Chain sweep disabled (periodic sweeps off)"`
- ✅ `"HF source: chain"`
- ✅ `"Chain fallback on empty: enabled"`
- ✅ `"[ComptrollerAdapter] Detected 2-tuple markets() variant (Kinetic-style)"`

## Running the Bot

### Option 1: PM2 (Recommended)

```powershell
pm2 stop liquidator
pm2 start packages\flare-kinetic-liquidator\dist\main.js --name liquidator --update-env
pm2 logs liquidator --lines 50
```

### Option 2: Direct Node

```powershell
cd packages\flare-kinetic-liquidator
node dist\main.js
```

### Option 3: NPM Script (from root)

```powershell
npm run start:flare
```

## Troubleshooting

### "Subgraph returned 0 candidates"

Check if the URL is accessible:
```powershell
curl -X POST -H "Content-Type: application/json" -d '{"query":"{ markets(first:1) { id }}"}' $env:SUBGRAPH_URL
```

The fallback will automatically scan the chain if enabled.

### "Chain sweep disabled" but fallback not triggering

This is correct behavior:
- Chain sweep is OFF for periodic scans
- Chain fallback is ON only when subgraph fails
- If subgraph returns candidates, no chain scan happens

### Want to force chain scan for testing

```powershell
$env:USE_SUBGRAPH="false"
$env:CHAIN_SWEEP_LOOKBACK="5000"
```

## Performance Comparison

| Mode | Time | RPC Calls | Candidates |
|------|------|-----------|------------|
| **Subgraph (current)** | 2-5s | ~50 (validation) | All borrowers |
| Chain sweep (30 blocks) | 15-30s | ~300 | Recent only |
| Chain sweep (20k blocks) | 5-10 min | ~20k | Historical |

## Summary

✅ **Your env vars are configured correctly!**  
✅ Subgraph for fast discovery  
✅ On-chain for accurate HF/prices  
✅ Chain sweeps disabled (not needed)  
✅ Fallback as safety net  
✅ Denylist filtering works  

Just run it and watch for the confirmation logs! 🚀

