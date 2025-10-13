# Deployment Guide - FlashLiquidatorV3

## One Contract Per Chain ✅

You only need **ONE** `FlashLiquidatorV3` deployment per chain (Flare). This single contract handles liquidations for **all Kinetic markets**.

## Contract Features

✅ **Uniswap V3 Flash Loans** - Implements `uniswapV3FlashCallback`  
✅ **Multi-Market Support** - Works with any Kinetic (Compound-v2) market  
✅ **SparkDEX/Enosys Compatible** - Factory and router wired at deployment  
✅ **Immutable Beneficiary** - Profit destination set at deployment (gas-efficient)  
✅ **Reentrancy Guard** - Prevents reentrancy attacks  
✅ **Emergency Pause** - Owner can pause all operations  
✅ **Admin Functions** - Pause, rescue tokens, transfer ownership  

## Liquidation Flow

```
1. Flash loan from Uniswap v3 pool (flashToken)
2. Swap flash → debt token (if needed, via router)
3. Call kToken.liquidateBorrow(borrower, repayAmount, kTokenCollateral)
4. Redeem seized kTokens to underlying collateral
5. Swap collateral → flash token (via router)
6. Repay flash loan + fee to pool
7. Send profit to beneficiary
```

## Prerequisites

1. **Environment Variables** in `.env`:
```env
V3_FACTORY=0x8A2578d23d4C532cC9A98FaD91C0523f5efDE652    # SparkDEX factory
DEX_ROUTER=0x8a1E35F5c98C4E85B36B7B253222eE17773b2781     # SparkDEX router
DEPLOYER_KEY=0xYOUR_PRIVATE_KEY
PAYOUT_TOKEN_BENEFICIARY=0xYourEOA                        # Profit destination
```

2. **Funded Wallet** - Gas for deployment (~2M gas)

## Deployment Steps

### Windows PowerShell

```powershell
# 1. Set environment variables
$env:DEPLOYER_KEY="0xYOURKEY"
$env:PAYOUT_TOKEN_BENEFICIARY="0xYourEOA"

# 2. Navigate to package
cd packages\flare-kinetic-liquidator

# 3. Install dependencies (if not done)
npm install

# 4. Compile contracts
npx hardhat compile

# 5. Deploy to Flare
npm run deploy:flash
```

**Expected Output**:
```
FLASH_EXECUTOR_V3= 0x1234...abcd
```

### Manual Deployment (Alternative)

```powershell
npx hardhat run scripts\deploy_flash.ts --network flare
```

## Post-Deployment

### 1. Save Contract Address

Copy the printed address and add to `.env`:

```env
FLASH_EXECUTOR_V3=0xYourDeployedAddress
```

### 2. Verify on Explorer (Optional)

```powershell
npx hardhat verify --network flare 0xYourDeployedAddress "0x8A2578d23d4C532cC9A98FaD91C0523f5efDE652" "0x8a1E35F5c98C4E85B36B7B253222eE17773b2781" "0xYourEOA"
```

### 3. Test Bot Connection

```powershell
# Build TypeScript
npm run build:flare

# Test in simulate mode
$env:SIMULATE="true"
$env:EXECUTE="false"
npm run start:flare
```

**Verify logs show**:
- Bot initializes successfully
- Comptroller params loaded
- Oracle address resolved
- No "FLASH_EXECUTOR_V3 not set" errors

## Admin Functions

Once deployed, the owner can:

### Emergency Pause
```solidity
contract.setPaused(true)   // Pause all liquidations
contract.setPaused(false)  // Resume
```

### Rescue Stuck Tokens
```solidity
contract.rescueTokens(tokenAddress, recipientAddress, amount)
```

### Transfer Ownership
```solidity
contract.transferOwnership(newOwnerAddress)
```

## Changing Beneficiary

**Important**: The `beneficiary` address is **immutable** (set at deployment for gas efficiency).

To redirect profits to a different address:

1. **Redeploy** the contract with new beneficiary:
   ```powershell
   $env:PAYOUT_TOKEN_BENEFICIARY="0xNewAddress"
   npm run deploy:flash
   ```

2. **Update `.env`** with new contract address:
   ```env
   FLASH_EXECUTOR_V3=0xNewContractAddress
   ```

3. **Restart bot** to use new contract

**Example - Redirect to specific address**:
```powershell
$env:DEPLOYER_KEY="0xYOUR_PRIVATE_KEY"
$env:PAYOUT_TOKEN_BENEFICIARY="0x492CF24a0162Bcd72265d4b7542836A5593d62Ac"
npm run deploy:flash
# Copy printed address to .env
npm run start:flare
```

## Security Notes

✅ **Reentrancy Protected** - `nonReentrant` modifier on entry  
✅ **Pause Capability** - Owner can emergency-stop operations  
✅ **Access Control** - Admin functions restricted to owner  
✅ **Immutable Core** - Factory, router, and beneficiary cannot be changed  
✅ **Profit Validation** - Requires minimum profit before sending  

## Gas Estimates

| Operation | Gas Used |
|-----------|----------|
| Deployment | ~2,000,000 |
| Liquidation (no swaps) | ~400,000 |
| Liquidation (2 swaps) | ~650,000 |
| setPaused() | ~25,000 |
| rescueTokens() | ~50,000 |
| transferOwnership() | ~28,000 |

## Multi-Market Support

This **single contract** handles all Kinetic markets because:

1. **Generic Interfaces** - Uses standard `ICToken` interface
2. **Dynamic Parameters** - Market addresses passed per liquidation
3. **Flexible Routing** - Handles any token pair via router
4. **Pool Discovery** - Bot finds appropriate v3 pool for each flash

**No need to deploy per-market contracts!**

## Troubleshooting

### "FLASH_EXECUTOR_V3 not set"
→ Add deployed address to `.env`

### "Unauthorized" error
→ Admin functions only callable by owner (deployer)

### "Paused" error
→ Contract paused via `setPaused(true)`. Call `setPaused(false)`.

### "pool-not-found"
→ No Uniswap v3 pool found for flash token pair. Check `V3_FEE_CANDIDATES` and `PRIMARY_FLASH_FALLBACK`.

### "minProfit" revert
→ Profit below threshold. Adjust `MIN_PROFIT_USD` or check slippage.

## Production Checklist

- [ ] Deployed to Flare mainnet
- [ ] Address added to `.env` as `FLASH_EXECUTOR_V3`
- [ ] Verified on Flare explorer (optional)
- [ ] Bot tested in `SIMULATE=true` mode
- [ ] At least one test liquidation executed successfully
- [ ] Owner wallet backed up securely
- [ ] Beneficiary address confirmed correct
- [ ] Emergency pause procedure documented

## Next Steps

After successful deployment:

1. **Test in Simulate Mode**
   ```powershell
   $env:SIMULATE="true"
   npm run start:flare
   ```

2. **Execute Test Liquidation**
   ```powershell
   $env:SIMULATE="false"
   $env:EXECUTE="true"
   $env:MAX_LIQUIDATIONS="1"
   npm run start:flare
   ```

3. **Scale Up**
   ```powershell
   $env:MAX_LIQUIDATIONS="3"
   $env:CHECK_INTERVAL="15000"
   npm run start:flare
   ```

## Support

For issues or questions:
- Check `IMPLEMENTATION.md` for technical details
- Review `README.md` for bot configuration
- See `PATCHES_APPLIED.md` for recent changes

---

**Remember**: One deployment handles all markets! 🚀

