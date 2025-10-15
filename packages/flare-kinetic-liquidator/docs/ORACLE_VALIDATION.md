# Oracle Validation & Configuration

## Overview

The bot now includes comprehensive oracle validation to prevent misconfiguration issues that could cause `"asset config doesn't exist"` errors.

## Problem Summary

Previously, the bot could connect to incorrect oracle addresses, leading to:
- ❌ `"asset config doesn't exist"` errors for valid kTokens
- ❌ Repeated failed price lookups causing log spam
- ❌ No validation that the oracle matches expectations

## Solution Implemented

### 1. Oracle Validation on Startup

**Location:** `src/bot/LiquidationBot.ts` and `src/bot/OnChainValidator.ts`

The bot now:
1. Resolves the oracle address from `Comptroller.oracle()`
2. Compares it with `KINETIC_ORACLE` environment variable (if set)
3. Throws an error if there's a mismatch
4. Logs the oracle source (env override vs comptroller resolved)

```typescript
// Example startup log
{
  event: "oracle_validated",
  source: "comptroller_resolved",  // or "env_override"
  oracle: "0xbf4c24c256d78a184fc7d7f2de061278fa504145",
  comptroller: "0xec7e541375d70c37262f619162502db9131d6db5"
}
```

### 2. Enhanced Error Handling

**Location:** `src/services/PriceServiceCompound.ts`

- Detects "asset config doesn't exist" errors
- Resolves and logs the token symbol for easier debugging
- Caches unpriced markets for 15 minutes to prevent repeated failures
- Provides clear remediation instructions

```typescript
// Example error log
❌ price-miss kFXRP 0xD1b7A5eF... via oracle=0xbF4C24...
   error="asset config doesn't exist"
   This market lacks oracle configuration. Caching for 15 minutes.
```

### 3. Symbol Resolution in OnChainValidator

**Location:** `src/bot/OnChainValidator.ts`

When price lookups fail during health factor calculations:
- Resolves token symbol for better logging
- Differentiates between "missing config" vs other errors
- Provides context (borrower, oracle, error message)

```typescript
// Example error log
❌ price-miss kFXRP 0xD1b7A5eF... via oracle=0xbF4C24...
   borrower=0x1234...
   error="asset config doesn't exist"
   Add to EXCLUDED_MARKETS or fix oracle mapping on-chain
```

## Configuration

### Correct Oracle Address (Flare Kinetic)

```powershell
$env:KINETIC_ORACLE="0xbF4C24C256d78a184FC7D7F2De061278fA504145"
$env:ORACLE_MODE="compound"
```

### Auto-Resolution (Recommended)

If you don't set `KINETIC_ORACLE`, the bot will:
1. Query `Comptroller.oracle()` 
2. Use the returned address
3. Log it for verification

```powershell
# Remove explicit oracle to auto-resolve
Remove-Item Env:\KINETIC_ORACLE -ErrorAction SilentlyContinue
```

### Override (Advanced)

To pin a specific oracle address:

```powershell
# Option A: Environment variable
$env:KINETIC_ORACLE="0xbF4C24C256d78a184FC7D7F2De061278fA504145"

# Option B: Add to .env file
# KINETIC_ORACLE=0xbF4C24C256d78a184FC7D7F2De061278fA504145
```

## Quick Fix Script

Run the included PowerShell script to fix oracle issues:

```powershell
.\scripts\fix-oracle.ps1
```

This script:
1. Stops the bot (if running with pm2)
2. Sets the correct oracle address
3. Configures chain-only pricing
4. Restarts the bot with updated environment

## Validation on Startup

The bot will validate the oracle configuration and log:

```
[OnChainValidator] Comptroller=0xeC7e541375D70c37262f619162502dB9131d6db5 
                   Oracle=0xbf4c24c256d78a184fc7d7f2de061278fa504145 (comptroller_resolved)
```

## Error Prevention

### Mismatch Detection

If `KINETIC_ORACLE` doesn't match `Comptroller.oracle()`, the bot will **refuse to start**:

```
❌ Oracle mismatch detected!
   Environment KINETIC_ORACLE: 0x952fc67c5930776fe890a812dcd23919559ee6b2
   Comptroller.oracle():       0xbf4c24c256d78a184fc7d7f2de061278fa504145
   This prevents using wrong oracle feeds. Fix by:
   - Remove KINETIC_ORACLE to auto-resolve from Comptroller, OR
   - Set KINETIC_ORACLE=0xbf4c24c256d78a184fc7d7f2de061278fa504145 to use Comptroller's oracle
```

### Unpriced Market Caching

Markets without oracle configuration are cached for 15 minutes:
- Prevents log spam from repeated failures
- Automatically retries after cache expires
- Use `EXCLUDED_MARKETS` for permanent exclusions

## Debugging

### Check Current Oracle

```typescript
// In node/TypeScript
const comptroller = new Contract(COMPTROLLER_ADDR, ["function oracle() view returns (address)"], provider);
const oracle = await comptroller.oracle();
console.log("Oracle:", oracle);
```

### Verify Market Configuration

```typescript
// Test if a kToken has oracle config
const oracle = new Contract(ORACLE_ADDR, ["function getUnderlyingPrice(address) view returns (uint256)"], provider);
try {
  const price = await oracle.getUnderlyingPrice(KTOKEN_ADDR);
  console.log("Price (mantissa):", price.toString());
} catch (err) {
  console.error("Oracle error:", err.reason || err.message);
}
```

### Clear Unpriced Cache

The `PriceServiceCompound` includes a method to clear the cache:

```typescript
priceService.clearUnpricedCache();
```

## Best Practices

1. **Use Auto-Resolution**: Let the bot read the oracle from Comptroller unless you have a specific reason to override
2. **Monitor Startup Logs**: Always check that the oracle address is correct on startup
3. **Use EXCLUDED_MARKETS**: For markets that permanently lack oracle config, add them to `EXCLUDED_MARKETS` instead of letting them fail repeatedly
4. **Update on Oracle Changes**: If the protocol updates the oracle, remove your override to pick up the new one

## Related Environment Variables

```powershell
# Oracle configuration
$env:KINETIC_ORACLE="0xbF4C24C256d78a184FC7D7F2De061278fA504145"  # Optional: override oracle
$env:ORACLE_MODE="compound"                                         # Required: oracle ABI type

# Market exclusions
$env:EXCLUDED_MARKETS="0xaddr1,0xaddr2"                            # Comma-separated list

# Discovery & pricing
$env:HF_SOURCE="chain"                                             # Use on-chain HF calculation
$env:USE_SUBGRAPH="false"                                          # Disable subgraph price data
```

## Troubleshooting

### Issue: "asset config doesn't exist"

**Cause:** The kToken doesn't have a price feed configured in the oracle

**Solutions:**
1. Check if you're using the correct oracle address (run `fix-oracle.ps1`)
2. Add the market to `EXCLUDED_MARKETS` if it legitimately lacks a feed
3. Contact protocol team to add oracle configuration on-chain

### Issue: Oracle mismatch on startup

**Cause:** `KINETIC_ORACLE` env var doesn't match `Comptroller.oracle()`

**Solutions:**
1. Remove `KINETIC_ORACLE` to auto-resolve: `Remove-Item Env:\KINETIC_ORACLE`
2. Update `KINETIC_ORACLE` to match the comptroller's oracle

### Issue: Repeated price errors

**Cause:** Multiple markets lack oracle configuration

**Solution:** Add them to `EXCLUDED_MARKETS`:
```powershell
$env:EXCLUDED_MARKETS="0xaddr1,0xaddr2,0xaddr3"
```

## Files Modified

- `src/bot/LiquidationBot.ts` - Oracle validation on init
- `src/bot/OnChainValidator.ts` - Oracle validation and enhanced error logging
- `src/services/PriceServiceCompound.ts` - Error detection, symbol resolution, caching
- `scripts/run.ps1` - Updated with correct oracle
- `scripts/fix-oracle.ps1` - New quick-fix script

## Testing

After applying this fix:

1. Start the bot and verify startup logs show correct oracle
2. Check that price lookups succeed for configured markets
3. Verify that unconfigured markets are cached (not spamming logs)
4. Confirm error messages include token symbols and clear instructions

## Support

If you encounter oracle issues:
1. Run `fix-oracle.ps1` to apply the correct configuration
2. Check startup logs for oracle validation messages
3. Look for `price-miss` errors with token symbols
4. Add problematic markets to `EXCLUDED_MARKETS` if needed

