# Subgraph-First Candidate Discovery

## Overview

The bot now uses a **subgraph-first** strategy for discovering liquidation candidates:
- **Subgraph**: Fast address discovery in O(pages), not O(blocks)
- **On-Chain**: Health factor, prices, and validation (always accurate)
- **Chain Fallback**: Safety net when subgraph fails or returns zero

## Environment Variables

### Your Current Setup (Correct! ✅)

```powershell
$env:USE_SUBGRAPH="true"
$env:SUBGRAPH_URL="https://api.goldsky.com/api/public/project_cmg51tyqo0x8v0lus07lih2dn/subgraphs/kinetic-liquidations/1.0.12/gn"
$env:SUBGRAPH_PAGE_SIZE="1000"
$env:HF_SOURCE="chain"              # On-chain prices only (correct)
$env:CHAIN_SWEEP_LOOKBACK="0"       # Disable routine chain sweep (correct)
$env:SAVE_CANDIDATES="1"
```

### Additional Options

```powershell
# Enable chain fallback only if subgraph fails
$env:CHAIN_FALLBACK_ON_EMPTY="1"    # Optional: fallback to chain if subgraph returns 0
$env:BLOCKS_PER_CHUNK="5000"        # Used by chain sweep if fallback triggers
$env:BLOCK_LOOKBACK="200000"        # Max lookback for chain fallback

# Denylist (already implemented)
$env:DENYLIST_WATCH="true"          # Optional: hot-reload denylist.txt
```

## How It Works

### 1. **Subgraph Discovery** (Primary)

The bot queries Goldsky for borrowers:

```graphql
query GetBorrowers($pageSize: Int!, $skip: Int!) {
  markets(first: 1000) {
    id
    symbol
    borrowers: accounts(
      first: $pageSize, 
      skip: $skip, 
      where: { totalUnderlyingBorrowed_gt: "0" }
    ) {
      id
    }
  }
}
```

**Features:**
- ✅ Paginates through all markets and borrowers
- ✅ De-duplicates addresses (lowercase)
- ✅ Filters denylisted addresses immediately
- ✅ Automatic fallback to alternative query if schema differs
- ✅ Retries on errors (5 attempts with exponential backoff)

### 2. **On-Chain Validation** (Always)

For each candidate from subgraph:
1. ✅ Call `comptroller.getAllMarkets()` to get valid cTokens
2. ✅ Read `getAssetsIn(borrower)` for user's markets
3. ✅ Call `getAccountSnapshot()` per asset for balances
4. ✅ Get prices from `comptroller.oracle()`
5. ✅ Calculate health factor on-chain
6. ✅ Skip if HF >= threshold

### 3. **Chain Fallback** (Safety Net)

Only runs if:
- `CHAIN_FALLBACK_ON_EMPTY="1"` AND
- Subgraph returns 0 candidates AND
- `CHAIN_SWEEP_LOOKBACK > 0`

Scans `Borrow` events from last N blocks.

## Expected Log Flow

### Normal Operation (Subgraph Working)

```json
{"event": "denylist_loaded", "count": 0}
{"event": "bot_ready", "comptroller": "0x...", "markets": 6}
{"event": "fetch_candidates", "useSubgraph": true}
{"event": "[SubgraphCandidates] Starting fetch with pageSize=1000"}
{"event": "[SubgraphCandidates] Page skip=0: found 127 new borrowers (total: 127)"}
{"event": "[SubgraphCandidates] Page skip=1000: found 43 new borrowers (total: 170)"}
{"event": "[SubgraphCandidates] Fetch complete: 170 unique borrowers"}
{"event": "subgraph_candidates", "count": 170}
{"event": "total_candidates", "count": 170}
{"event": "[OnChainValidator] Found 6 markets from comptroller"}
{"event": "[ComptrollerAdapter] Detected 2-tuple markets() variant (Kinetic-style)"}
```

### With Denylist

```json
{"event": "denylist_loaded", "count": 22}
{"event": "[SubgraphCandidates] Fetch complete: 148 unique borrowers"}
{"event": "subgraph_candidates", "count": 148}
{"event": "denylist_filtered", "count": 0}  // Already filtered in subgraph
{"event": "total_candidates", "count": 148}
```

### Fallback Triggered

```json
{"event": "subgraph_error", "error": "timeout"}
{"event": "chain_fallback_triggered", "reason": "subgraph returned no candidates"}
{"event": "chain_sweep_start", "fromBlock": 5800000, "toBlock": 6000000}
{"event": "chain_candidates_found", "count": 85}
```

## Performance Comparison

| Method | Time | RPC Calls | Coverage |
|--------|------|-----------|----------|
| **Subgraph-first** | ~2-5s | ~50 (validation only) | All borrowers |
| Chain sweep (30 blocks) | ~15-30s | ~300 | Recent borrowers only |
| Chain sweep (20k blocks) | ~5-10 min | ~20k | Historical backfill |

## Configuration Presets

### Recommended (Your Current Setup) ✅

```powershell
$env:USE_SUBGRAPH="true"
$env:SUBGRAPH_PAGE_SIZE="1000"
$env:CHAIN_FALLBACK_ON_EMPTY="1"
$env:CHAIN_SWEEP_LOOKBACK="20000"
$env:HF_SOURCE="chain"
```

**Best for:** Production - fast discovery with safety net

### Development/Testing

```powershell
$env:USE_SUBGRAPH="true"
$env:SUBGRAPH_PAGE_SIZE="100"
$env:CHAIN_FALLBACK_ON_EMPTY="0"
$env:CHAIN_SWEEP_LOOKBACK="0"
$env:SIMULATE="true"
```

**Best for:** Testing without chain fallback overhead

### Chain-Only (No Subgraph)

```powershell
$env:USE_SUBGRAPH="false"
$env:CHAIN_SWEEP_LOOKBACK="5000"
$env:CHAIN_FALLBACK_ON_EMPTY="0"
```

**Best for:** Subgraph is down, emergency mode

## Troubleshooting

### Subgraph Returns 0 Candidates

Check if URL is correct:
```powershell
curl -X POST $env:SUBGRAPH_URL -H "Content-Type: application/json" -d '{"query":"{ markets(first:1) { id }}"}'
```

Enable fallback:
```powershell
$env:CHAIN_FALLBACK_ON_EMPTY="1"
```

### Schema Mismatch

The bot auto-detects and tries fallback queries:
1. First tries: `markets.borrowers` (Kinetic-style)
2. Falls back to: `accounts(where:{totalBorrowValueInUSD_gt:0})`

Check logs for:
```json
{"event": "[SubgraphCandidates] No markets returned, trying fallback query"}
```

### Too Many Candidates

Reduce page size to avoid timeouts:
```powershell
$env:SUBGRAPH_PAGE_SIZE="500"
```

Or add more to denylist:
```txt
# config/denylist.txt
0xBadAddress1...
0xBadAddress2...
```

## Running the Bot

### Start with PM2 (Windows-Safe)

```powershell
pm2 stop liquidator
pm2 start packages\flare-kinetic-liquidator\dist\main.js --name liquidator --update-env
pm2 logs liquidator --lines 100
```

### Or Direct

```powershell
cd packages\flare-kinetic-liquidator
node dist\main.js
```

### Verify It's Working

You should see:
```json
{"event": "bot_ready", "markets": 6}
{"event": "fetch_candidates", "useSubgraph": true}
{"event": "[SubgraphCandidates] Fetch complete: X unique borrowers"}
{"event": "[ComptrollerAdapter] Detected 2-tuple markets() variant (Kinetic-style)"}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     LIQUIDATION BOT                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
              ┌───────────────────────────────┐
              │   CANDIDATE DISCOVERY         │
              │   (Address Set)               │
              └───────────────────────────────┘
                     ↙                ↘
            ┌──────────┐          ┌──────────┐
            │ Subgraph │          │  Chain   │
            │ (Primary)│          │(Fallback)│
            │ O(pages) │          │O(blocks) │
            └──────────┘          └──────────┘
                     ↘                ↙
              ┌───────────────────────────────┐
              │   DENYLIST FILTER             │
              │   (Early Exit)                │
              └───────────────────────────────┘
                              │
                              ↓
              ┌───────────────────────────────┐
              │   ON-CHAIN VALIDATION         │
              │   - getAllMarkets()           │
              │   - markets(cToken)           │
              │   - getAccountSnapshot()      │
              │   - oracle.getPrice()         │
              │   - Calculate HF              │
              └───────────────────────────────┘
                              │
                              ↓
              ┌───────────────────────────────┐
              │   PROFITABLE?                 │
              │   - Calculate seized          │
              │   - Quote swaps               │
              │   - Estimate PnL              │
              └───────────────────────────────┘
                              │
                              ↓
              ┌───────────────────────────────┐
              │   EXECUTE LIQUIDATION         │
              │   (if EXECUTE=true)           │
              └───────────────────────────────┘
```

## Summary

✅ **Your env vars are correct!**  
✅ Subgraph discovers addresses (fast)  
✅ On-chain validates health factor (accurate)  
✅ Chain fallback as safety net  
✅ Denylist filters early  
✅ 2-tuple decoder works for Kinetic  

Just rebuild and run! 🚀

