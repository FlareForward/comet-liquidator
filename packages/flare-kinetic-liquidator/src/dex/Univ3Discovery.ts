import { Contract, providers } from "ethers";
import FactoryAbi from "../abi/univ3factory.json";

export async function findPool(provider: providers.Provider, factory: string, a: string, b: string, fees: number[]) {
  const F = new Contract(factory, FactoryAbi, provider);
  for (const f of fees) {
    const p = await F.getPool(a, b, f);
    if (p && p !== "0x0000000000000000000000000000000000000000") return { pool: p, fee: f };
  }
  return null;
}


