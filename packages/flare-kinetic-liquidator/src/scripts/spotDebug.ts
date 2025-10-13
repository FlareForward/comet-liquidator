import * as dotenv from "dotenv";
import { Contract, JsonRpcProvider } from "ethers";
import { borrowUsd18 } from "../services/price";

dotenv.config({ path: "../../.env" });

const RPC_URL = process.env.RPC_URL || "https://flare-api.flare.network/ext/C/rpc";
const COMPTROLLER = process.env.KINETIC_COMPTROLLER || process.env.COMPTROLLER!;
const EXCLUDED = (process.env.EXCLUDED_MARKETS || "")
  .split(",")
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

const USER = (process.env.SPOT_USER || "0xff450fd64ac7586d8ca3a326855d874a828bd971").toLowerCase();

const provider = new JsonRpcProvider(RPC_URL);

const COMPTROLLER_ABI = [
  "function getAssetsIn(address) view returns (address[])",
  "function getAccountLiquidity(address) view returns (uint256,uint256,uint256)",
  "function oracle() view returns (address)"
];

// Multi-comptroller scope selection
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

async function main() {
  const scope = await getAssetsInAny(USER);
  console.log(JSON.stringify({ boot: { user: USER, scope: scope ? { comptroller: scope.compAddr } : null } }));
  if (!scope) {
    console.log(JSON.stringify({ assetsIn: [] }));
    console.log(JSON.stringify({ summary: { totalBorrowUsd18: "0", comp_err: "0", liquidity: "0", shortfall: "0" } }));
    return;
  }

  const assets: string[] = scope.assets;
  const oracleAddr: string = await scope.comp.oracle();
  console.log(JSON.stringify({ assetsIn: assets, oracle: oracleAddr }));

  let totalUsd = 0n;
  for (const c of assets) {
    if (EXCLUDED.includes(c.toLowerCase())) {
      console.log(JSON.stringify({ skip: { cToken: c, reason: "excluded_market" } }));
      continue;
    }
    try {
      const usd = await borrowUsd18(USER, c, provider);
      totalUsd += usd;
      console.log(JSON.stringify({ borrow: { cToken: c, usd18: usd.toString() } }));
    } catch (e: any) {
      console.log(JSON.stringify({ borrow_error: { cToken: c, error: e.message } }));
    }
  }

  const [err, liq, short] = await scope.comp.getAccountLiquidity(USER);
  console.log(JSON.stringify({ summary: { totalBorrowUsd18: totalUsd.toString(), comp_err: err.toString(), liquidity: liq.toString(), shortfall: short.toString() } }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


