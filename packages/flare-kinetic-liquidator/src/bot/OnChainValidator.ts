import { Provider } from "ethers";
import { ComptrollerAdapter } from "../adapters/ComptrollerAdapter";
import { CTokenAdapter } from "../adapters/CTokenAdapter";
import { PriceServiceCompound } from "../services/PriceServiceCompound";
import { healthFactor } from "../services/HealthFactor";
import { Candidate } from "../sources/SubgraphCandidates";

export interface ValidatedCandidate extends Candidate {
  healthFactor: number;
  markets: Array<{
    kToken: string;
    underlying: string;
    borrowBalance: bigint;
    collateralBalance: bigint;
    price: string;
  }>;
}

export class OnChainValidator {
  constructor(
    readonly provider: Provider,
    readonly comptroller: ComptrollerAdapter,
    readonly priceService: PriceServiceCompound
  ) {}

  async validate(candidate: Candidate, minHealthFactor: number): Promise<ValidatedCandidate | null> {
    try {
      const markets = await this.comptroller.getAllMarkets();
      const params = await this.comptroller.getParams();
      
      let totalCollateralUsd = 0n;
      let totalBorrowUsd = 0n;
      const marketData = [];

      for (const kToken of markets) {
        const adapter = new CTokenAdapter(this.provider, kToken);
        const borrow = await adapter.borrowBalanceStored(candidate.address);
        const info = await this.comptroller.marketInfo(kToken);
        
        if (!info.isListed) continue;
        
        const price = await this.priceService.priceOf(kToken);
        const priceBigInt = BigInt(price);
        
        // Accumulate borrow in 18-dec USD
        const borrowUsd = (borrow * priceBigInt) / 1_000000_000000_000000n;
        totalBorrowUsd += borrowUsd;
        
        // TODO: get actual collateral balance (requires reading cToken balance + exchangeRate)
        // For now, skip collateral accumulation
        
        if (borrow > 0n) {
          marketData.push({
            kToken,
            underlying: (await adapter.underlying()).addr,
            borrowBalance: borrow,
            collateralBalance: 0n,
            price
          });
        }
      }

      if (totalBorrowUsd === 0n) return null;
      
      const hf = healthFactor(totalCollateralUsd, totalBorrowUsd);
      
      if (hf >= minHealthFactor) return null;

      return {
        ...candidate,
        healthFactor: hf,
        markets: marketData
      };
    } catch (err: any) {
      console.error(`Failed to validate ${candidate.address}:`, err.message);
      return null;
    }
  }
}

