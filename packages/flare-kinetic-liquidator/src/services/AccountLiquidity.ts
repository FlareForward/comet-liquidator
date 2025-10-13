import { Contract, Provider } from "ethers";

const ONE = 1000000000000000000n;

export interface MarketInfo {
  kToken: string;
  underlying: string;
  collateralFactor: number;
  decimals: number;
  price: string;
}

export async function accountLiquidity(
  acct: string,
  markets: MarketInfo[],
  deps: { prov: Provider; ctokenAbi: any }
): Promise<{ col: bigint; bor: bigint }> {
  let col = 0n;
  let bor = 0n;

  for (const m of markets) {
    const c = new Contract(m.kToken, deps.ctokenAbi, deps.prov);
    
    // Get collateral balance
    const er = BigInt(await c.exchangeRateStored());     // 18-dec mantissa
    const cBal = BigInt(await c.balanceOf(acct));
    const uBal = (cBal * er) / ONE;              // underlying in 18-dec equivalent
    
    // Adjust for underlying decimals
    const decDiff = 18 - m.decimals;
    let uBalAdj: bigint;
    if (m.decimals === 18) {
      uBalAdj = uBal;
    } else if (decDiff > 0) {
      uBalAdj = uBal / BigInt(10 ** decDiff);
    } else {
      uBalAdj = uBal * BigInt(10 ** Math.abs(decDiff));
    }
    const colUsd = (BigInt(m.price) * uBalAdj) / ONE;
    col = col + (colUsd * BigInt(Math.floor(m.collateralFactor * 1e4))) / 10000n;

    // Get borrow balance
    const b = BigInt(await c.borrowBalanceStored(acct));
    let bAdj: bigint;
    if (m.decimals === 18) {
      bAdj = b;
    } else if (decDiff > 0) {
      bAdj = b * BigInt(10 ** decDiff);
    } else {
      bAdj = b / BigInt(10 ** Math.abs(decDiff));
    }
    const borUsd = (BigInt(m.price) * bAdj) / ONE;
    bor = bor + borUsd;
  }

  return { col, bor };
}

