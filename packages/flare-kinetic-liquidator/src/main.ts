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
  candidateSource: process.env.CANDIDATE_SOURCE || (process.env.USE_SUBGRAPH === "true" ? "subgraph" : "chain"),
  useSubgraph: process.env.USE_SUBGRAPH === "true" || process.env.CANDIDATE_SOURCE === "subgraph" || process.env.CANDIDATE_SOURCE === "both",
  subgraphPageSize: parseInt(process.env.SUBGRAPH_PAGE_SIZE || "1000"),
  subgraphTimeout: parseInt(process.env.SUBGRAPH_TIMEOUT_MS || "6000"),
  subgraphRetries: parseInt(process.env.SUBGRAPH_RETRIES || "5"),
  candidateLimit: parseInt(process.env.CANDIDATE_LIMIT || "0"), // 0 = unlimited
  chainFallbackOnEmpty: process.env.CHAIN_FALLBACK_ON_EMPTY === "true" || process.env.CHAIN_FALLBACK_ON_EMPTY === "1",
  chainSweepLookback: parseInt(process.env.CHAIN_SWEEP_LOOKBACK || process.env.SCAN_LOOKBACK_BLOCKS || "0"),
  blocksPerChunk: parseInt(process.env.BLOCKS_PER_CHUNK || "5000"),
  blockLookback: parseInt(process.env.BLOCK_LOOKBACK || "200000")
};

console.log("Starting Flare Kinetic Liquidator Bot...");
console.log("Config:", { ...config, privateKey: config.privateKey ? "***" : undefined });

// Confirm discovery mode
console.log("\n=== Candidate Discovery Configuration ===");
console.log(`Using candidate source: ${config.candidateSource}`);
console.log(`Subgraph enabled: ${config.useSubgraph}`);
if (config.useSubgraph) {
  console.log(`Subgraph URL: ${config.subgraphUrl}`);
  console.log(`Subgraph page size: ${config.subgraphPageSize}`);
  console.log(`Subgraph timeout: ${config.subgraphTimeout}ms`);
  console.log(`Subgraph retries: ${config.subgraphRetries}`);
  if (config.candidateLimit > 0) {
    console.log(`Candidate limit: ${config.candidateLimit}`);
  } else {
    console.log(`Candidate limit: unlimited`);
  }
}
console.log(`HF source: ${process.env.HF_SOURCE || "chain"}`);
console.log(`Chain sweep lookback: ${config.chainSweepLookback} blocks`);
if (config.chainSweepLookback === 0) {
  console.log("Chain sweep disabled (periodic sweeps off)");
} else {
  console.log(`Chain sweep active for last ${config.chainSweepLookback} blocks`);
}
console.log(`Chain fallback on empty: ${config.chainFallbackOnEmpty ? "enabled" : "disabled"}`);
if (config.chainFallbackOnEmpty) {
  console.log(`Fallback will scan ${config.blockLookback} blocks in ${config.blocksPerChunk}-block chunks`);
}
console.log("==========================================\n");

const bot = new LiquidationBot(config);
bot.run().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});

