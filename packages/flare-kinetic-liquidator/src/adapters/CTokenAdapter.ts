import { BigNumber, Contract, providers } from "ethers";
import cTokenAbi from "../abi/ctoken.json";
import erc20 from "../abi/erc20.json";

export class CTokenAdapter {
  readonly c: Contract;
  constructor(readonly provider: providers.Provider, readonly kToken: string) {
    this.c = new Contract(kToken, cTokenAbi, provider);
  }
  async underlying(): Promise<{ addr: string; decimals: number; }> {
    const u = await this.c.underlying();
    const e = new Contract(u, erc20, this.provider);
    const d = await e.decimals();
    return { addr: u, decimals: Number(d) };
  }
  borrowBalanceStored(a: string): Promise<BigNumber> { return this.c.borrowBalanceStored(a); }
  exchangeRateStored(): Promise<BigNumber> { return this.c.exchangeRateStored(); }
}


