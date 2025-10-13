import { Contract, Provider } from "ethers";
import cTokenAbi from "../abi/ctoken.json";
import erc20 from "../abi/erc20.json";

export class CTokenAdapter {
  readonly c: Contract;
  constructor(readonly provider: Provider, readonly kToken: string) {
    this.c = new Contract(kToken, cTokenAbi, provider);
  }
  async underlying(): Promise<{ addr: string; decimals: number; }> {
    const u = await this.c.underlying();
    const e = new Contract(u, erc20, this.provider);
    const d = await e.decimals();
    return { addr: u, decimals: Number(d) };
  }
  borrowBalanceStored(a: string): Promise<bigint> { return this.c.borrowBalanceStored(a); }
  exchangeRateStored(): Promise<bigint> { return this.c.exchangeRateStored(); }
}


