# QuickStart - Deploy & Run in 5 Minutes

## Step 1: Set Environment Variables

```powershell
$env:DEPLOYER_KEY="0xYOUR_PRIVATE_KEY"
$env:PAYOUT_TOKEN_BENEFICIARY="0x492CF24a0162Bcd72265d4b7542836A5593d62Ac"
```

## Step 2: Deploy Flash Executor (Once)

```powershell
npm run deploy:flash
```

**Output**:
```
FLASH_EXECUTOR_V3= 0x1234...abcd
```

## Step 3: Update .env

Add the printed address to `.env` file:

```env
FLASH_EXECUTOR_V3=0x1234...abcd
```

## Step 4: Build TypeScript

```powershell
npm run build:flare
```

## Step 5: Test in Simulate Mode

```powershell
$env:SIMULATE="true"
$env:EXECUTE="false"
npm run start:flare
```

**Expected logs**:
```json
{"timestamp":"...","event":"init","comptroller":{...}}
{"timestamp":"...","event":"bot_ready","simulate":true}
{"timestamp":"...","event":"fetch_candidates"}
{"timestamp":"...","event":"liquidatable_found","borrower":"0x...","healthFactor":"0.95"}
{"timestamp":"...","event":"simulate_liquidation","repayAmount":"..."}
```

## Step 6: Go Live

```powershell
$env:SIMULATE="false"
$env:EXECUTE="true"
$env:MAX_LIQUIDATIONS="1"
npm run start:flare
```

---

## To Change Profit Destination

**Important**: Beneficiary is immutable - requires redeployment.

```powershell
# 1. Deploy new contract with different beneficiary
$env:PAYOUT_TOKEN_BENEFICIARY="0xNEW_ADDRESS"
npm run deploy:flash

# 2. Update .env with new contract address
# FLASH_EXECUTOR_V3=0xNewContractAddress

# 3. Restart bot
npm run start:flare
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "FLASH_EXECUTOR_V3 not set" | Add deployed address to `.env` |
| "oracle returns 0" | Check `KINETIC_COMPTROLLER` address |
| "pool-not-found" | Verify `V3_FACTORY` and `PRIMARY_FLASH_FALLBACK` |
| "gas too high" | Adjust `MAX_GAS_PRICE_GWEI` |
| "minProfit" revert | Lower `MIN_PROFIT_USD` or check `SLIPPAGE_BPS` |

---

## Full Documentation

- **DEPLOYMENT_GUIDE.md** - Complete deployment details
- **README.md** - Configuration reference
- **IMPLEMENTATION.md** - Technical architecture
- **PATCHES_APPLIED.md** - Recent enhancements

---

**That's it!** One deployment handles all Kinetic markets. 🚀

