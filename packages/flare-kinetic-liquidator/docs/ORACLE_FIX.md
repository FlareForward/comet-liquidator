# Oracle Price Feed Fix

## Problem

Oracle at `0xbF4C24C256d78a184FC7D7F2De061278fA504145` is missing a price mapping for:
- **Underlying:** `0xad552a648c74d49e10027ab8a618a3ad4901c5be`
- **kToken:** `0xd1b7a5efa9bd88f291f7a4563a8f6185c0249cb3`

This causes repeated `missing revert data` errors:
```
❌ price-miss kToken=0xd1b7a5efa9bd88f291f7a4563a8f6185c0249cb3 
   error=missing revert data (action="call", data=null, ...)
```

## Hotfix (Applied)

The bot now **excludes** this market from HF calculations via:

```bash
EXCLUDED_MARKETS=0xd1b7a5efa9bd88f291f7a4563a8f6185c0249cb3
```

- Set in environment or `.env` file
- Bot will skip this market during `borrowUsd18` calculations
- Prevents repeated oracle reverts and CRITICAL log spam

## Permanent Fix (On-Chain)

### Step 1: Add Price Feed Mapping

Choose the method that matches your oracle implementation:

**Option A: Chainlink-style aggregator**
```solidity
oracle.setFeed(
  0xad552a648c74d49e10027ab8a618a3ad4901c5be, // underlying
  <aggregatorAddress>                          // Chainlink price feed
);
```

**Option B: Direct price setter**
```solidity
oracle.setDirectPrice(
  0xad552a648c74d49e10027ab8a618a3ad4901c5be, // underlying
  <priceInOracleUnits>                         // e.g., 1e(36-decimals)
);
```

**Option C: Router-based**
```solidity
router.setOracleForMarket(
  0xd1b7a5efa9bd88f291f7a4563a8f6185c0249cb3, // kToken
  0xbF4C24C256d78a184FC7D7F2De061278fA504145  // oracle
);
```

### Step 2: Verify the Fix

Before removing from `EXCLUDED_MARKETS`, verify the oracle responds:

```javascript
const oracle = new Contract(
  "0xbF4C24C256d78a184FC7D7F2De061278fA504145",
  ["function getUnderlyingPrice(address) view returns (uint256)"],
  provider
);

const price = await oracle.callStatic.getUnderlyingPrice(
  "0xd1b7a5efa9bd88f291f7a4563a8f6185c0249cb3"
);

console.log("Price (mantissa):", price.toString());
// Expect: non-zero bigint, e.g., "1000000000000000000000000000000000000" (1e36 for 18-decimal asset)
```

### Step 3: Re-enable the Market

Once the oracle responds with a valid price:

1. Remove `0xd1b7a5efa9bd88f291f7a4563a8f6185c0249cb3` from `EXCLUDED_MARKETS`
2. Restart the bot
3. Monitor logs for `{"event":"HF", ...}` entries including this market

## Current Status

- ✅ Bot excludes this market (no more reverts)
- ⏳ Oracle mapping pending (DevOps task)
- ✅ Multi-comptroller discovery works (6+2 markets found)
- ✅ Other markets operate normally

## Guardrails in Place

1. **Key price cache by kToken address** (not symbol)
2. **Abort HF batch on unresolved price-miss** (critical guard)
3. **Atomic cache writes** (temp file + rename)
4. **Bigint-only pricing** (no float coercion)
5. **Per-user comptroller scoping** (handles multi-pool deployments)

## Related Files

- `src/bot/OnChainValidator.ts` (lines 215-224): EXCLUDED_MARKETS filter
- `src/services/price.ts`: borrowUsd18WithOracle (strict bigint math)
- `src/lib/denylist.ts`: Hard-coded address denylist

