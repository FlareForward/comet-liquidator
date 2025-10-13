import { Contract, Provider } from "ethers";
import OracleAbi from "../abi/compoundOracle.json";

export class PriceServiceCompound {
  c: Contract;
  constructor(readonly provider: Provider, readonly oracle: string) {
    this.c = new Contract(oracle, OracleAbi, provider);
  }
  // returns 18-dec USD price
  async priceOf(kToken: string): Promise<string> {
    const p = await this.c.getUnderlyingPrice(kToken);
    return p.toString();
  }
}


