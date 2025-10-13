import * as dotenv from "dotenv";
import { LiquidationBot } from "./bot/LiquidationBot";

dotenv.config({ path: "../../.env" });

const config = {
  rpcUrl: process.env.RPC_URL || "https://flare-api.flare.network/ext/C/rpc",
  comptroller: process.env.KINETIC_COMPTROLLER || process.env.COMPTROLLER!,
  subgraphUrl: process.env.SUBGRAPH_URL!,
  v3Factory: process.env.V3_FACTORY!,
  flashExecutor: process.env.FLASH_EXECUTOR_V3!,
  privateKey: process.env.DEPLOYER_KEY,
  minHealthFactor: parseFloat(process.env.MIN_HEALTH_FACTOR || "1.1"),
  minProfitUsd: parseFloat(process.env.MIN_PROFIT_USD || "50"),
  checkInterval: parseInt(process.env.CHECK_INTERVAL || "30000"),
  simulate: process.env.SIMULATE === "true",
  maxLiquidations: parseInt(process.env.MAX_LIQUIDATIONS || "1")
};

console.log("Starting Flare Kinetic Liquidator Bot...");
console.log("Config:", { ...config, privateKey: config.privateKey ? "***" : undefined });

const bot = new LiquidationBot(config);
bot.run().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});

