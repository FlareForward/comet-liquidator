import * as dotenv from "dotenv";
import { Contract, JsonRpcProvider } from "ethers";
import { borrowUsd18 } from "../services/price";

dotenv.config({ path: "../../.env" });

const RPC_URL = process.env.RPC_URL || "https://flare-api.flare.network/ext/C/rpc";
const CHECK_INTERVAL_MS = parseInt(process.env.CHECK_INTERVAL_MS || "10000", 10);

// Parse target addresses from env or use defaults
const TARGET_ADDRESSES = (process.env.TARGET_ADDRESSES || 
  "0x03b3de2b874ec661d2f9a76296b69e1fc52f0d28,0xa5979e4e9c4482a9c3dc774dc9ba60050359ad92")
  .split(",")
  .map(a => a.trim().toLowerCase())
  .filter(Boolean);

const provider = new JsonRpcProvider(RPC_URL);

const COMPTROLLER_ABI = [
  "function getAssetsIn(address) view returns (address[])",
  "function getAccountLiquidity(address) view returns (uint256,uint256,uint256)",
  "function oracle() view returns (address)"
];

interface PositionStatus {
  address: string;
  comptroller: string | null;
  totalBorrowUsd: bigint;
  liquidity: bigint;
  shortfall: bigint;
  isLiquidatable: boolean;
  markets: number;
  error?: string;
}

let checkCount = 0;

async function getAssetsInAny(user: string) {
  const list = (process.env.UNITROLLER_LIST || process.env.COMPTROLLER || "").split(",").map(s => s.trim()).filter(Boolean);
  for (const compAddr of list) {
    const comp = new Contract(compAddr, COMPTROLLER_ABI, provider);
    try {
      const assets: string[] = await comp.getAssetsIn(user);
      if (assets.length) {
        return { compAddr, comp, assets };
      }
    } catch {}
  }
  return null;
}

async function checkSinglePosition(address: string): Promise<PositionStatus> {
  try {
    const scope = await getAssetsInAny(address);
    
    if (!scope) {
      return {
        address,
        comptroller: null,
        totalBorrowUsd: 0n,
        liquidity: 0n,
        shortfall: 0n,
        isLiquidatable: false,
        markets: 0,
        error: "No position found"
      };
    }

    const assets: string[] = scope.assets;
    let totalBorrowUsd = 0n;
    
    for (const cToken of assets) {
      try {
        const usd = await borrowUsd18(address, cToken, provider);
        totalBorrowUsd += usd;
      } catch (e) {
        // Skip errors for individual markets
      }
    }

    const [err, liquidity, shortfall] = await scope.comp.getAccountLiquidity(address);

    return {
      address,
      comptroller: scope.compAddr,
      totalBorrowUsd,
      liquidity,
      shortfall,
      isLiquidatable: shortfall > 0n,
      markets: assets.length
    };

  } catch (error: any) {
    return {
      address,
      comptroller: null,
      totalBorrowUsd: 0n,
      liquidity: 0n,
      shortfall: 0n,
      isLiquidatable: false,
      markets: 0,
      error: error.message
    };
  }
}

async function checkAllPositions(): Promise<PositionStatus[]> {
  const promises = TARGET_ADDRESSES.map(addr => checkSinglePosition(addr));
  return Promise.all(promises);
}

function formatUsd(value: bigint): string {
  return (Number(value) / 1e18).toFixed(2);
}

async function monitor() {
  console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                  MULTI-POSITION MONITOR - CONTINUOUS MODE                  ║
╚════════════════════════════════════════════════════════════════════════════╝

Watching ${TARGET_ADDRESSES.length} addresses:
${TARGET_ADDRESSES.map((addr, i) => `  ${i + 1}. ${addr}`).join("\n")}

Check Interval: ${CHECK_INTERVAL_MS}ms (${CHECK_INTERVAL_MS / 1000}s)
RPC: ${RPC_URL}

🎯 Will alert when any position becomes liquidatable (shortfall > 0)
Press Ctrl+C to stop.
`);

  while (true) {
    checkCount++;
    const timestamp = new Date().toISOString();
    
    console.log(`\n${"=".repeat(80)}`);
    console.log(`🔍 Check #${checkCount} at ${timestamp}`);
    console.log(`${"=".repeat(80)}`);

    const statuses = await checkAllPositions();
    
    let foundLiquidatable = false;

    for (let i = 0; i < statuses.length; i++) {
      const status = statuses[i];
      const prefix = `[${i + 1}/${statuses.length}]`;
      
      console.log(`\n${prefix} 📍 ${status.address}`);
      
      if (status.error) {
        console.log(`    ❌ ${status.error}`);
        continue;
      }

      if (!status.comptroller) {
        console.log(`    ⚠️  No position found`);
        continue;
      }

      const borrowUsd = formatUsd(status.totalBorrowUsd);
      const liquidityUsd = formatUsd(status.liquidity);
      const shortfallUsd = formatUsd(status.shortfall);
      
      // Calculate Health Factor: HF = 1 + (liquidity / borrowed) when shortfall = 0
      // When shortfall > 0, HF < 1.0
      let healthFactor = "N/A";
      if (status.totalBorrowUsd > 0n) {
        if (status.shortfall > 0n) {
          // Underwater: HF = (borrowed - shortfall) / borrowed
          const hf = Number(status.totalBorrowUsd - status.shortfall) / Number(status.totalBorrowUsd);
          healthFactor = hf.toFixed(4);
        } else if (status.liquidity >= 0n) {
          // Healthy: HF = 1 + (liquidity / borrowed)
          const hf = 1 + (Number(status.liquidity) / Number(status.totalBorrowUsd));
          healthFactor = hf.toFixed(4);
        }
      }

      console.log(`    📊 Markets: ${status.markets}`);
      console.log(`    💰 Borrowed: $${borrowUsd}`);
      console.log(`    💎 Liquidity: $${liquidityUsd}`);
      console.log(`    🔻 Shortfall: $${shortfallUsd}`);
      console.log(`    ❤️  Health Factor: ${healthFactor}`);

      if (status.isLiquidatable) {
        console.log(`    🚨 ${"*".repeat(70)} 🚨`);
        console.log(`    🚨 ${" ".repeat(15)} ⚡ LIQUIDATABLE! HF: ${healthFactor} ⚡ ${" ".repeat(15)} 🚨`);
        console.log(`    🚨 ${"*".repeat(70)} 🚨`);
        foundLiquidatable = true;
      } else {
        console.log(`    ✅ HEALTHY`);
      }
    }

    if (foundLiquidatable) {
      console.log(`\n🎯 ${"!".repeat(78)} 🎯`);
      console.log(`🎯 LIQUIDATION OPPORTUNITY DETECTED! Check logs above for details.`);
      console.log(`🎯 ${"!".repeat(78)} 🎯`);
      // Alert sound
      console.log("\x07\x07\x07");
    }

    console.log(`\n⏳ Next check in ${CHECK_INTERVAL_MS / 1000} seconds...\n`);
    await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL_MS));
  }
}

monitor().catch((e) => {
  console.error("\n💥 Fatal error:", e);
  process.exit(1);
});

