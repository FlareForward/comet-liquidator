# Operations Runbook - FlashLiquidatorV3

## Admin Scripts (Windows PowerShell)

All commands assume you're in the repo root with `.env` configured.

### Emergency Pause

Stop all liquidations immediately:

```powershell
cd packages\flare-kinetic-liquidator
$env:PAUSE="true"
npx hardhat run scripts\admin\setPaused.ts --network flare
```

### Resume Operations

Unpause after resolving issues:

```powershell
cd packages\flare-kinetic-liquidator
$env:PAUSE="false"
npx hardhat run scripts\admin\setPaused.ts --network flare
```

### Rescue Stuck Tokens

If tokens get stuck in the contract:

```powershell
cd packages\flare-kinetic-liquidator
$env:RESCUE_TOKEN="0xTokenAddress"
$env:RESCUE_TO="0x492CF24a0162Bcd72265d4b7542836A5593d62Ac"
$env:RESCUE_AMOUNT="1000000"  # Amount in token's native decimals
npx hardhat run scripts\admin\rescueTokens.ts --network flare
```

**Example - Rescue 1 USDT0 (6 decimals)**:
```powershell
$env:RESCUE_TOKEN=$env:USDT0
$env:RESCUE_TO="0x492CF24a0162Bcd72265d4b7542836A5593d62Ac"
$env:RESCUE_AMOUNT="1000000"
npx hardhat run scripts\admin\rescueTokens.ts --network flare
```

### Transfer Ownership

Transfer admin rights to a new wallet:

```powershell
cd packages\flare-kinetic-liquidator
$env:NEW_OWNER="0xNewOwnerAddress"
npx hardhat run scripts\admin\transferOwnership.ts --network flare
```

---

## Go-Live Checklist

### Pre-Deployment

- [ ] `.env` configured with all required variables
- [ ] `DEPLOYER_KEY` has sufficient gas funds
- [ ] `PAYOUT_TOKEN_BENEFICIARY` set to correct address

### Deployment

```powershell
cd packages\flare-kinetic-liquidator
$env:DEPLOYER_KEY="0xYOUR_KEY"
$env:PAYOUT_TOKEN_BENEFICIARY="0x492CF24a0162Bcd72265d4b7542836A5593d62Ac"
npm run deploy:flash
```

- [ ] Copy printed `FLASH_EXECUTOR_V3` address
- [ ] Add to `.env`: `FLASH_EXECUTOR_V3=0xDeployedAddress`
- [ ] Verify contract on Flare explorer (optional)

### Pre-Production Testing

```powershell
cd packages\flare-kinetic-liquidator
npm run build:flare

# Dry run
$env:SIMULATE="true"
$env:EXECUTE="false"
npm run start:flare
```

**Verify logs show**:
- [ ] Bot initializes successfully
- [ ] Comptroller params loaded
- [ ] Oracle returns valid prices
- [ ] Candidates found from subgraph
- [ ] Health factors calculated correctly
- [ ] PnL estimation shows profit opportunities
- [ ] Pool discovery finds SparkDEX pools

### Go Live

```powershell
$env:SIMULATE="false"
$env:EXECUTE="true"
$env:MAX_LIQUIDATIONS="1"
npm run start:flare
```

**Monitor first liquidation**:
- [ ] Transaction succeeds
- [ ] Profit arrives at beneficiary
- [ ] Gas usage reasonable (~400-650k gas)
- [ ] No errors in logs

### Scale Up

After successful test liquidations:

```powershell
$env:MAX_LIQUIDATIONS="3"
$env:MIN_PROFIT_USD="25"
$env:CHECK_INTERVAL="15000"
npm run start:flare
```

---

## Incident Response

### Scenario 1: Spike in Quote Errors

**Symptoms**: Many `quote_error` events in logs

**Cause**: DEX liquidity issues or pool problems

**Action**:
1. **Pause immediately**:
   ```powershell
   $env:PAUSE="true"
   npx hardhat run scripts\admin\setPaused.ts --network flare
   ```

2. **Investigate**:
   - Check SparkDEX pool liquidity
   - Verify `V3_FEE_CANDIDATES` pools exist
   - Test `PRIMARY_FLASH_FALLBACK` token pairs

3. **Fix config** and unpause:
   ```powershell
   $env:PAUSE="false"
   npx hardhat run scripts\admin\setPaused.ts --network flare
   ```

### Scenario 2: Wrong Beneficiary Address

**Symptoms**: Profits going to incorrect address

**Cause**: Beneficiary is immutable - set at deployment

**Action**:
1. **Stop current bot** (Ctrl+C)

2. **Deploy new contract** with correct beneficiary:
   ```powershell
   $env:PAYOUT_TOKEN_BENEFICIARY="0xCorrectAddress"
   npm run deploy:flash
   ```

3. **Update `.env`** with new contract address

4. **Restart bot**:
   ```powershell
   npm run start:flare
   ```

### Scenario 3: Tokens Stuck in Contract

**Symptoms**: Contract balance > 0 after liquidations

**Cause**: Partial failure or dust accumulation

**Action**:
```powershell
# Check contract balance first
# Then rescue to your address
$env:RESCUE_TOKEN="0xTokenAddress"
$env:RESCUE_TO="0x492CF24a0162Bcd72265d4b7542836A5593d62Ac"
$env:RESCUE_AMOUNT="1000000"
npx hardhat run scripts\admin\rescueTokens.ts --network flare
```

### Scenario 4: Gas Price Spike

**Symptoms**: Many `gas_too_high` events

**Cause**: Network congestion

**Action**:
1. **Adjust threshold** in `.env`:
   ```env
   MAX_GAS_PRICE_GWEI=150  # Increase from 100
   ```

2. **Restart bot**

3. **Monitor profitability** - higher gas reduces profit

### Scenario 5: Oracle Returns Zero

**Symptoms**: Bot exits with "Invalid oracle address" or price errors

**Cause**: Oracle contract issue or wrong address

**Action**:
1. **Verify comptroller** address in `.env`
2. **Check oracle** on Flare explorer
3. **Contact Kinetic team** if oracle is down
4. **Wait** and retry - transient issues usually resolve

### Scenario 6: minProfit Reverts

**Symptoms**: Transactions reverting with "minProfit" error

**Cause**: Actual profit below estimated profit

**Action**:
1. **Increase slippage tolerance**:
   ```env
   SLIPPAGE_BPS=50  # Increase from 30
   ```

2. **Or lower minimum profit**:
   ```env
   MIN_PROFIT_USD=25  # Decrease from 50
   ```

3. **Restart bot**

---

## Monitoring

### Key Metrics

Monitor these fields in JSON logs:

- `liquidation_success` count - Successful liquidations
- `liquidation_error` count - Failed attempts
- `pnlUsd` values - Profit per liquidation
- `gasUsed` values - Gas efficiency
- `skip_unprofitable` count - Opportunities skipped

### Alerting Thresholds

Set alerts for:

- ⚠️ `liquidation_error` rate > 20%
- ⚠️ No `liquidation_success` in 1 hour during active periods
- ⚠️ `gasUsed` > 800,000 (inefficient)
- ⚠️ `pnlUsd` < 10 (barely profitable)
- 🚨 `gas_too_high` rate > 50%

### Log Aggregation

Parse logs with `jq`:

```powershell
# Count successes in last 100 lines
Get-Content logs.json -Tail 100 | jq 'select(.event=="liquidation_success")' | Measure-Object

# Average PnL
Get-Content logs.json | jq 'select(.event=="liquidation_success") | .pnlUsd' | Measure-Object -Average

# Recent errors
Get-Content logs.json -Tail 50 | jq 'select(.event | contains("error"))'
```

---

## Maintenance

### Daily

- [ ] Check bot is running (logs updating)
- [ ] Review `liquidation_success` count
- [ ] Verify beneficiary balance increasing
- [ ] Check for persistent errors

### Weekly

- [ ] Review average PnL per liquidation
- [ ] Optimize `MIN_PROFIT_USD` if needed
- [ ] Check gas usage trends
- [ ] Verify oracle prices are sane

### Monthly

- [ ] Review total profit vs. gas costs
- [ ] Audit contract for stuck tokens
- [ ] Check for Kinetic protocol updates
- [ ] Review and rotate logs

---

## Emergency Contacts

- **Kinetic Discord**: [Link to support channel]
- **SparkDEX Issues**: [Contact info]
- **Flare Network Status**: https://flare.network

---

## Important Notes

⚠️ **Beneficiary is immutable** - To change profit destination, redeploy contract  
⚠️ **Owner controls admin functions** - Keep deployer key secure  
⚠️ **One contract handles all markets** - No per-market deployments needed  
⚠️ **Pause is your friend** - Use it liberally when investigating issues  

---

**Last Updated**: 2025-10-13

