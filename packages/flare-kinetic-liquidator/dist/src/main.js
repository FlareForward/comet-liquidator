"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
const LiquidationBot_1 = require("./bot/LiquidationBot");
dotenv.config({ path: "../../.env" });
const config = {
    rpcUrl: process.env.RPC_URL || "https://flare-api.flare.network/ext/C/rpc",
    comptroller: process.env.KINETIC_COMPTROLLER || process.env.COMPTROLLER,
    subgraphUrl: process.env.SUBGRAPH_URL,
    v3Factory: process.env.V3_FACTORY,
    flashExecutor: process.env.FLASH_EXECUTOR_V3,
    privateKey: process.env.DEPLOYER_KEY,
    minHealthFactor: parseFloat(process.env.MIN_HEALTH_FACTOR || "1.1"),
    minProfitUsd: parseFloat(process.env.MIN_PROFIT_USD || "50"),
    checkInterval: parseInt(process.env.CHECK_INTERVAL || "30000"),
    simulate: process.env.SIMULATE === "true",
    maxLiquidations: parseInt(process.env.MAX_LIQUIDATIONS || "1")
};
console.log("Starting Flare Kinetic Liquidator Bot...");
console.log("Config:", { ...config, privateKey: config.privateKey ? "***" : undefined });
const bot = new LiquidationBot_1.LiquidationBot(config);
bot.run().catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
});
