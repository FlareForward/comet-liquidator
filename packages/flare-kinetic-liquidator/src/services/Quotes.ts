import { Contract, Provider } from "ethers";
import routerAbi from "../abi/routerV2.json";

export async function quoteOut(router: string, prov: Provider, path: string[], amountIn: bigint): Promise<bigint> {
  const r = new Contract(router, routerAbi, prov);
  const amounts: bigint[] = await r.getAmountsOut(amountIn, path);
  return amounts[amounts.length - 1];
}

export function withSlippage(x: bigint, bps: number): bigint {
  return (x * BigInt(10000 - bps)) / 10000n;
}

