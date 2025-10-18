import * as dotenv from "dotenv";
import { Contract, JsonRpcProvider } from "ethers";
import { borrowUsd18 } from "../services/price";

dotenv.config({ path: "../../.env" });

const RPC_URL = process.env.RPC_URL || "https://flare-api.flare.network/ext/C/rpc";
const TARGET_USER = (process.env.TARGET_USER || "0x03b3de2b874ec661d2f9a76296b69e1fc52f0d28").toLowerCase();
const CHECK_INTERVAL_MS = parseInt(process.env.CHECK_INTERVAL_MS || "10000", 10); // 10 seconds default

const provider = new JsonRpcProvider(RPC_URL);

const COMPTROLLER_ABI = [
  "function getAssetsIn(address) view returns (address[])",
  "function getAccountLiquidity(address) view returns (uint256,uint256,uint256)",
  "function oracle() view returns (address)"
];

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

async function checkPosition() {
  checkCount++;
  const timestamp = new Date().toISOString();
  
  console.log(`\n${"=".repeat(80)}`);
  console.log(`🔍 Check #${checkCount} at ${timestamp}`);
  console.log(`📍 Target: ${TARGET_USER}`);
  console.log(`${"=".repeat(80)}`);

  try {
    const scope = await getAssetsInAny(TARGET_USER);
    
    if (!scope) {
      console.log("❌ No positions found in any comptroller");
      return false;
    }

    console.log(`✅ Found position in comptroller: ${scope.compAddr}`);
    
    const assets: string[] = scope.assets;
    const oracleAddr: string = await scope.comp.oracle();
    console.log(`📊 Markets entered: ${assets.length}`);
    console.log(`🔮 Oracle: ${oracleAddr}`);

    let totalBorrowUsd = 0n;
    for (const cToken of assets) {
      try {
        const usd = await borrowUsd18(TARGET_USER, cToken, provider);
        totalBorrowUsd += usd;
        const usdFormatted = (Number(usd) / 1e18).toFixed(2);
        console.log(`   💰 Borrow in ${cToken.substring(0, 10)}...: $${usdFormatted}`);
      } catch (e: any) {
        console.log(`   ⚠️  Error reading ${cToken}: ${e.message}`);
      }
    }

    const [err, liquidity, shortfall] = await scope.comp.getAccountLiquidity(TARGET_USER);
    
    const totalBorrowFormatted = (Number(totalBorrowUsd) / 1e18).toFixed(2);
    const liquidityFormatted = (Number(liquidity) / 1e18).toFixed(4);
    const shortfallFormatted = (Number(shortfall) / 1e18).toFixed(4);

    console.log(`\n📈 ACCOUNT SUMMARY:`);
    console.log(`   Total Borrowed: $${totalBorrowFormatted}`);
    console.log(`   Liquidity: $${liquidityFormatted}`);
    console.log(`   Shortfall: $${shortfallFormatted}`);

    if (shortfall > 0n) {
      console.log(`\n🚨 ${"*".repeat(76)} 🚨`);
      console.log(`🚨 ${" ".repeat(20)} POSITION IS UNDERWATER! ${" ".repeat(20)} 🚨`);
      console.log(`🚨 ${" ".repeat(20)} SHORTFALL: $${shortfallFormatted} ${" ".repeat(20)} 🚨`);
      console.log(`🚨 ${" ".repeat(20)} *** LIQUIDATABLE NOW *** ${" ".repeat(20)} 🚨`);
      console.log(`🚨 ${"*".repeat(76)} 🚨`);
      
      // Alert sound (Windows beep)
      console.log("\x07\x07\x07");
      
      return true;
    } else {
      console.log(`\n✅ Position is HEALTHY (shortfall = 0)`);
      console.log(`   Still has $${liquidityFormatted} borrowing capacity remaining`);
      return false;
    }

  } catch (error: any) {
    console.error(`\n❌ Error checking position: ${error.message}`);
    return false;
  }
}

async function monitor() {
  console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                     POSITION MONITOR - CONTINUOUS MODE                     ║
╚════════════════════════════════════════════════════════════════════════════╝

Target Address: ${TARGET_USER}
Check Interval: ${CHECK_INTERVAL_MS}ms (${CHECK_INTERVAL_MS / 1000}s)
RPC: ${RPC_URL}

Monitoring will continue until position becomes liquidatable...
Press Ctrl+C to stop.
`);

  while (true) {
    const isLiquidatable = await checkPosition();
    
    if (isLiquidatable) {
      console.log(`\n🎯 LIQUIDATION OPPORTUNITY DETECTED!`);
      console.log(`\nYou can now run the liquidation bot to execute.`);
      console.log(`Or continue monitoring by pressing any key...`);
      console.log(`Press Ctrl+C to stop monitoring.`);
      // Keep monitoring even after finding one
    }

    console.log(`\n⏳ Next check in ${CHECK_INTERVAL_MS / 1000} seconds...`);
    await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL_MS));
  }
}

monitor().catch((e) => {
  console.error("\n💥 Fatal error:", e);
  process.exit(1);
});


