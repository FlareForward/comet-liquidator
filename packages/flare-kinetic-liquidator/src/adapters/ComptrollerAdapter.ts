import { Contract, providers } from "ethers";
import ComptrollerAbi from "../abi/comptroller.json";
const MANTISSA = 1e18;

export class ComptrollerAdapter {
  constructor(readonly provider: providers.Provider, readonly comptroller: string) {}

  contract = new Contract(this.comptroller, ComptrollerAbi, this.provider);

  async getParams() {
    const [closeFactorMantissa, liqIncentiveMantissa] = await Promise.all([
      this.contract.closeFactorMantissa(),
      this.contract.liquidationIncentiveMantissa()
    ]);
    return {
      closeFactor: Number(closeFactorMantissa) / MANTISSA,
      liqIncentive: Number(liqIncentiveMantissa) / MANTISSA,
      oracle: await this.contract.oracle()
    };
  }

  async getAllMarkets(): Promise<string[]> {
    return this.contract.getAllMarkets();
  }

  async marketInfo(kToken: string) {
    const m = await this.contract.markets(kToken);
    return { isListed: m.isListed, collateralFactor: Number(m.collateralFactorMantissa) / MANTISSA };
  }
}


