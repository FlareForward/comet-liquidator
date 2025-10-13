import { JsonRpcProvider, Wallet } from "ethers";
import { ComptrollerAdapter } from "../adapters/ComptrollerAdapter";
import { PriceServiceCompound } from "../services/PriceServiceCompound";
import { SubgraphCandidates } from "../sources/SubgraphCandidates";
import { OnChainValidator } from "./OnChainValidator";
import { execFlash } from "../strategy/FlashRepayStrategy";

interface BotConfig {
  rpcUrl: string;
  comptroller: string;
  subgraphUrl: string;
  v3Factory: string;
  flashExecutor: string;
  privateKey?: string;
  minHealthFactor: number;
  minProfitUsd: number;
  checkInterval: number;
  simulate: boolean;
  maxLiquidations: number;
}

export class LiquidationBot {
  provider: JsonRpcProvider;
  comptroller: ComptrollerAdapter;
  priceService?: PriceServiceCompound;
  subgraph: SubgraphCandidates;
  validator?: OnChainValidator;
  wallet?: Wallet;
  
  constructor(readonly config: BotConfig) {
    this.provider = new JsonRpcProvider(config.rpcUrl);
    this.comptroller = new ComptrollerAdapter(this.provider, config.comptroller);
    this.subgraph = new SubgraphCandidates(config.subgraphUrl);
    
    if (config.privateKey) {
      this.wallet = new Wallet(config.privateKey, this.provider);
    }
  }

  async init() {
    const params = await this.comptroller.getParams();
    console.log("Comptroller params:", params);
    
    this.priceService = new PriceServiceCompound(this.provider, params.oracle);
    this.validator = new OnChainValidator(this.provider, this.comptroller, this.priceService);
    
    console.log(`Bot initialized. Simulate: ${this.config.simulate}`);
  }

  async run() {
    await this.init();
    
    while (true) {
      try {
        await this.checkAndLiquidate();
      } catch (err: any) {
        console.error("Bot error:", err.message);
      }
      
      console.log(`Sleeping ${this.config.checkInterval}ms...`);
      await new Promise(r => setTimeout(r, this.config.checkInterval));
    }
  }

  async checkAndLiquidate() {
    console.log("Fetching candidates from subgraph...");
    const candidates = await this.subgraph.fetch();
    console.log(`Found ${candidates.length} candidates`);
    
    if (!this.validator) return;
    
    let liquidated = 0;
    
    for (const c of candidates) {
      if (liquidated >= this.config.maxLiquidations) break;
      
      const validated = await this.validator.validate(c, this.config.minHealthFactor);
      if (!validated) continue;
      
      console.log(`Liquidatable: ${validated.address} HF=${validated.healthFactor.toFixed(3)}`);
      
      if (this.config.simulate) {
        console.log("  [SIMULATE] Would liquidate but simulate=true");
        continue;
      }
      
      if (!this.wallet) {
        console.log("  [SKIP] No private key configured");
        continue;
      }
      
      // TODO: choose best debt/collateral pair and calculate profitability
      console.log("  [SKIP] Profitability logic not yet implemented");
      
      liquidated++;
    }
  }
}

