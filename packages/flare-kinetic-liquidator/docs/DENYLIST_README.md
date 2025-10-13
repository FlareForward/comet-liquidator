# Denylist Module

## Overview

The denylist module filters out problematic addresses early in the liquidation pipeline, preventing wasted RPC calls and avoiding validation errors on known bad addresses.

## Files

- **`src/lib/denylist.ts`** - Core denylist module with load/check/add/remove/watch functionality
- **`config/denylist.txt`** - Text file containing addresses to deny (one per line, case-insensitive)

## Usage

### Basic Integration

The denylist is automatically loaded on module import. It's integrated at two key points:

1. **Early Pipeline Filtering** (`LiquidationBot.checkAndLiquidate()`)
   - Filters candidates immediately after discovery
   - Logs how many were filtered
   - Prevents unnecessary RPC calls

2. **Validation Guard** (`OnChainValidator.validate()`)
   - Double-check before expensive on-chain validation
   - Returns null immediately for denied addresses

### Configuration

#### Adding Addresses

Edit `config/denylist.txt`:

```txt
# Denylist - one address per line
# Lines starting with # are comments and will be ignored
# Addresses are automatically normalized to lowercase

0x0811e928418f431acddd944c58791b44a64e431d
0x91830d51bbdc7010876f3d7cd2cd1866985643f5
0xc218244d...
0x45caf785...
```

#### Environment Variables

- **`DENYLIST_FILE`** - Custom path to denylist file (default: `config/denylist.txt`)
- **`DENYLIST_WATCH=true`** - Enable hot-reload on file changes (checks every 2 seconds)

### API

```typescript
import { isDenied, addDenied, removeDenied, loadDenylist, watchDenylist, getDenylistSize } from "./lib/denylist";

// Check if address is denied
if (isDenied("0xABCD...")) {
  // Skip processing
}

// Add/remove at runtime
addDenied("0xABCD...");
removeDenied("0xABCD...");

// Reload from file
loadDenylist("/custom/path/denylist.txt");

// Enable hot-reload
watchDenylist();

// Get count
console.log(`Denylist has ${getDenylistSize()} addresses`);
```

## Benefits

✅ **Performance** - Avoids wasted RPC calls on known problematic addresses  
✅ **Error Reduction** - Prevents BAD_DATA errors from invalid addresses  
✅ **Operational Control** - Easy to add/remove addresses without code changes  
✅ **Hot-Reload** - Can update denylist while bot is running (with `DENYLIST_WATCH=true`)  
✅ **Logging** - Clear visibility into how many candidates are filtered  

## Logging

The denylist produces the following log events:

```json
{"event": "denylist_loaded", "count": 22}
{"event": "denylist_filtered", "count": 5}
{"event": "[OnChainValidator] Skipping denylisted address: 0x..."}
```

## Optional Enhancements

For production environments, consider:

1. **Database Storage** - Store denylist in a DB table `denylist(address, reason, added_at)`
2. **Admin API** - Expose endpoints to list/add/remove entries dynamically
3. **Testing Flag** - Add `DENYLIST_SKIP_VALIDATION=true` env var to disable for testing
4. **Metrics** - Track how many candidates are filtered over time
5. **Reason Codes** - Add comments in denylist.txt explaining why each address is denied

## Example Workflow

1. Bot discovers 100 candidates from subgraph
2. Denylist filter removes 22 problematic addresses → 78 remain
3. OnChainValidator processes 78 candidates (saves 22 * N RPC calls)
4. Double-check in validator catches any that slipped through

## Maintenance

- Review denylist periodically to remove addresses that are no longer problematic
- Add new problematic addresses as they're discovered
- Use comments in `denylist.txt` to document why addresses were added
- Monitor logs to see if denylist is catching many addresses

