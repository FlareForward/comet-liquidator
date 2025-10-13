# Flare Kinetic Liquidator

Minimal Compound-v2 (Kinetic) liquidator for Flare Network with Uniswap-v3 flash loans via SparkDEX/Enosys.

## Architecture

- **Solidity Executor**: `FlashLiquidatorV3.sol` - Flash loan + liquidate + repay + profit extraction
- **TypeScript Bot**: Main loop with subgraph candidate discovery and on-chain validation
- **Windows-Safe**: All scripts use PowerShell (no `&&` or bash)

## Setup

1. Copy `.env.example` or set these vars in your `.env` at repo root:

```env
RPC_URL=https://flare-api.flare.network/ext/C/rpc
KINETIC_COMPTROLLER=0xeC7e541375D70c37262f619162502dB9131d6db5
SUBGRAPH_URL=https://api.goldsky.com/api/public/project_cmg5ltyqo0x8v01us07lih2dr/subgraphs/kinetic-liquidations/1.0.12/gn
V3_FACTORY=0x8A2578d23d4C532cC9A98FaD91C0523f5efDE652
DEX_ROUTER=0x8a1E35F5c98C4E85B36B7B253222eE17773b2781
DEPLOYER_KEY=0xYOUR_PRIVATE_KEY
PAYOUT_TOKEN_BENEFICIARY=0xYourEOA
MIN_HEALTH_FACTOR=1.1
MIN_PROFIT_USD=50
CHECK_INTERVAL=30000
SIMULATE=true
```

2. Deploy the flash executor:

```powershell
npm run deploy:flash
```

3. Copy the printed `FLASH_EXECUTOR_V3` address and add to `.env`.

4. Build and run the bot:

```powershell
npm run build:flare
npm run start:flare
```

## Scripts

- `npm run build:flare` - Compile TypeScript
- `npm run deploy:flash` - Deploy FlashLiquidatorV3 (Windows PS)
- `npm run start:flare` - Run the bot (Windows PS)

## How It Works

1. **Candidate Discovery**: Subgraph returns accounts with borrows
2. **On-Chain Validation**: Reads actual health factor from Comptroller/Oracle
3. **Profitability Check**: Estimates profit after flash fees and slippage (TODO)
4. **Execution**: Calls FlashLiquidatorV3 with optimal debt/collateral pair
5. **Flash Flow**:
   - Borrow flash token from Uniswap v3 pool
   - Swap to debt token (if needed)
   - Call `liquidateBorrow` on kToken
   - Redeem seized collateral
   - Swap back to flash token
   - Repay flash + fee
   - Send profit to beneficiary

## Files

- `contracts/FlashLiquidatorV3.sol` - Flash executor
- `src/adapters/` - Comptroller and CToken wrappers
- `src/services/` - Price and health factor logic
- `src/sources/` - Subgraph candidate fetcher
- `src/dex/` - Uniswap v3 pool discovery
- `src/strategy/` - Flash repay strategy
- `src/bot/` - Main bot loop and validator
- `src/main.ts` - Entry point

## TODO

- [ ] Add collateral balance reading in OnChainValidator
- [ ] Implement profitability calculation (PnL estimation)
- [ ] Wire FlashRepayStrategy into bot when profitable
- [ ] Add slippage guards and gas price checks
- [ ] Test on Flare mainnet with live data
- [ ] Add logging and metrics

## Safety

- Always test with `SIMULATE=true` first
- Set reasonable `MIN_PROFIT_USD` to avoid unprofitable txs
- Monitor gas prices with `MAX_GAS_PRICE_GWEI`
- Start with `MAX_LIQUIDATIONS=1` for safety

