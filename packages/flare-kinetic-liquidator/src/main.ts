import * as dotenv from "dotenv";
import { LiquidationBot } from "./bot/LiquidationBot";
import { parseUnits } from "ethers";

dotenv.config({ path: "../../.env" });

const config = {
  rpcUrl: process.env.RPC_URL || "https://flare-api.flare.network/ext/C/rpc",
  comptroller: process.env.KINETIC_COMPTROLLER || process.env.COMPTROLLER!,
  subgraphUrl: process.env.SUBGRAPH_URL || "",
  v3Factory: process.env.V3_FACTORY!,
  flashExecutor: process.env.FLASH_EXECUTOR_V3!,
  dexRouter: process.env.DEX_ROUTER!,
  privateKey: process.env.DEPLOYER_KEY,
  minHealthFactor: parseFloat(process.env.MIN_HEALTH_FACTOR || "1.1"),
  minProfitUsd: parseFloat(process.env.MIN_PROFIT_USD || "50"),
  checkInterval: parseInt(process.env.CHECK_INTERVAL || "30000"),
  simulate: process.env.SIMULATE === "true",
  execute: process.env.EXECUTE === "true",
  maxLiquidations: parseInt(process.env.MAX_LIQUIDATIONS || "1"),
  maxGasPrice: parseUnits(process.env.MAX_GAS_PRICE_GWEI || "100", "gwei"),
  slippageBps: parseInt(process.env.SLIPPAGE_BPS || "30"),
  flashFeeBps: parseInt(process.env.FLASH_FEE_BPS || "5"),
  v3FeeCandidates: (process.env.V3_FEE_CANDIDATES || "100,500,3000").split(",").map(x => parseInt(x)),
  
  // Candidate discovery settings
  useSubgraph: process.env.USE_SUBGRAPH === "true" || process.env.CANDIDATE_SOURCE === "both",
  subgraphPageSize: parseInt(process.env.SUBGRAPH_PAGE_SIZE || "1000"),
  chainFallbackOnEmpty: process.env.CHAIN_FALLBACK_ON_EMPTY === "true" || process.env.CHAIN_FALLBACK_ON_EMPTY === "1",
  chainSweepLookback: parseInt(process.env.CHAIN_SWEEP_LOOKBACK || process.env.SCAN_LOOKBACK_BLOCKS || "0")
};

console.log("Starting Flare Kinetic Liquidator Bot...");
console.log("Config:", { ...config, privateKey: config.privateKey ? "***" : undefined });

const bot = new LiquidationBot(config);
bot.run().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});

