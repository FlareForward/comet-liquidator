import { Contract, Provider, Interface } from "ethers";
const MANTISSA = 1e18;

// Kinetic uses 2-tuple, standard Compound uses 3-tuple
const ABI_MARKETS_2 = ["function markets(address) view returns (bool, uint256)"];
const ABI_MARKETS_3 = ["function markets(address) view returns (bool, uint256, bool)"];

const COMPTROLLER_ABI = [
  "function getAllMarkets() view returns (address[])",
  "function closeFactorMantissa() view returns (uint256)",
  "function liquidationIncentiveMantissa() view returns (uint256)",
  "function oracle() view returns (address)"
];

type MarketVariant = "2ret" | "3ret" | null;

export class ComptrollerAdapter {
  private cachedVariant: MarketVariant = null;
  private marketSet: Set<string> | null = null;
  private iface2 = new Interface(ABI_MARKETS_2);
  private iface3 = new Interface(ABI_MARKETS_3);

  constructor(readonly provider: Provider, readonly comptroller: string) {}

  contract = new Contract(this.comptroller, COMPTROLLER_ABI, this.provider);

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
    const markets = await this.contract.getAllMarkets();
    // Cache market set for validation
    this.marketSet = new Set(markets.map((a: string) => a.toLowerCase()));
    return markets;
  }

  async marketInfo(kToken: string) {
    // Validate this is a known cToken
    if (this.marketSet && !this.marketSet.has(kToken.toLowerCase())) {
      throw new Error(`${kToken} is not in getAllMarkets() - not a valid cToken`);
    }

    // Use cached variant if known, otherwise try both
    if (this.cachedVariant === "2ret") {
      return this.readMarket2(kToken);
    } else if (this.cachedVariant === "3ret") {
      return this.readMarket3(kToken);
    }

    // First call: try both decoders
    const data = this.iface2.encodeFunctionData("markets", [kToken]);
    const raw = await this.provider.call({ to: this.comptroller, data });

    try {
      const [listed, cf] = this.iface2.decodeFunctionResult("markets", raw) as unknown as [boolean, bigint];
      this.cachedVariant = "2ret";
      console.log(`[ComptrollerAdapter] Detected 2-tuple markets() variant (Kinetic-style)`);
      return { isListed: listed, collateralFactor: Number(cf) / MANTISSA };
    } catch {
      try {
        const [listed, cf] = this.iface3.decodeFunctionResult("markets", raw) as unknown as [boolean, bigint, boolean];
        this.cachedVariant = "3ret";
        console.log(`[ComptrollerAdapter] Detected 3-tuple markets() variant (Compound-style)`);
        return { isListed: listed, collateralFactor: Number(cf) / MANTISSA };
      } catch (err: any) {
        throw new Error(`Failed to decode markets(${kToken}): ${err.message}`);
      }
    }
  }

  private async readMarket2(kToken: string) {
    const data = this.iface2.encodeFunctionData("markets", [kToken]);
    const raw = await this.provider.call({ to: this.comptroller, data });
    const [listed, cf] = this.iface2.decodeFunctionResult("markets", raw) as unknown as [boolean, bigint];
    return { isListed: listed, collateralFactor: Number(cf) / MANTISSA };
  }

  private async readMarket3(kToken: string) {
    const data = this.iface3.encodeFunctionData("markets", [kToken]);
    const raw = await this.provider.call({ to: this.comptroller, data });
    const [listed, cf] = this.iface3.decodeFunctionResult("markets", raw) as unknown as [boolean, bigint, boolean];
    return { isListed: listed, collateralFactor: Number(cf) / MANTISSA };
  }
}


