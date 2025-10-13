// packages/flare-kinetic-liquidator/hardhat.config.ts
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";

// Load .env from repo root
dotenvConfig({ path: resolve(__dirname, "../../.env") });

import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const KEY = process.env.DEPLOYER_KEY || process.env.PRIVATE_KEY || "";
const ACC = KEY ? [KEY] : [];

console.log("Loading config - KEY present:", !!KEY);
console.log("RPC_URL:", process.env.RPC_URL || "not set");

const hhConfig: HardhatUserConfig = {
  solidity: { version: "0.8.24", settings: { optimizer: { enabled: true, runs: 200 } } },
  networks: {
    flare: { 
      url: process.env.RPC_URL || "https://flare-api.flare.network/ext/C/rpc", 
      accounts: ACC 
    },
  },
};

export default hhConfig;
