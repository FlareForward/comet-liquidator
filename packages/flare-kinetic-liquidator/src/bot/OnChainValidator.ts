import { Provider } from "ethers";
import { ComptrollerAdapter } from "../adapters/ComptrollerAdapter";
import { CTokenAdapter } from "../adapters/CTokenAdapter";
import { PriceServiceCompound } from "../services/PriceServiceCompound";
import { healthFactor } from "../services/HealthFactor";
import { accountLiquidity, MarketInfo } from "../services/AccountLiquidity";
import { Candidate } from "../sources/SubgraphCandidates";
import cTokenAbi from "../abi/ctoken.json";

export interface ValidatedCandidate extends Candidate {
  healthFactor: number;
  markets: Array<{
    kToken: string;
    underlying: string;
    decimals: number;
    borrowBalance: bigint;
    collateralBalance: bigint;
    price: string;
    collateralFactor: number;
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
      
      const marketInfos: MarketInfo[] = [];
      const marketData = [];

      for (const kToken of markets) {
        const adapter = new CTokenAdapter(this.provider, kToken);
        const info = await this.comptroller.marketInfo(kToken);
        
        if (!info.isListed) continue;
        
        const underlyingData = await adapter.underlying();
        const price = await this.priceService.priceOf(kToken);
        
        marketInfos.push({
          kToken,
          underlying: underlyingData.addr,
          collateralFactor: info.collateralFactor,
          decimals: underlyingData.decimals,
          price
        });
        
        const borrow = await adapter.borrowBalanceStored(candidate.address);
        
        if (borrow > 0n) {
          marketData.push({
            kToken,
            underlying: underlyingData.addr,
            decimals: underlyingData.decimals,
            borrowBalance: borrow,
            collateralBalance: 0n, // Will be filled by accountLiquidity
            price,
            collateralFactor: info.collateralFactor
          });
        }
      }

      // Calculate real account liquidity with collateral
      const { col, bor } = await accountLiquidity(candidate.address, marketInfos, {
        prov: this.provider,
        ctokenAbi: cTokenAbi
      });

      if (bor === 0n) return null;
      
      const hf = healthFactor(col, bor);
      
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

