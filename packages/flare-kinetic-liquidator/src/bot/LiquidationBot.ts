import { JsonRpcProvider, Wallet, formatUnits, parseUnits } from "ethers";
import { ComptrollerAdapter } from "../adapters/ComptrollerAdapter";
import { PriceServiceCompound } from "../services/PriceServiceCompound";
import { SubgraphCandidates } from "../sources/SubgraphCandidates";
import { OnChainValidator } from "./OnChainValidator";
import { execFlash } from "../strategy/FlashRepayStrategy";
import { quoteOut, withSlippage } from "../services/Quotes";

interface BotConfig {
  rpcUrl: string;
  comptroller: string;
  subgraphUrl: string;
  v3Factory: string;
  flashExecutor: string;
  dexRouter: string;
  privateKey?: string;
  minHealthFactor: number;
  minProfitUsd: number;
  checkInterval: number;
  simulate: boolean;
  execute: boolean;
  maxLiquidations: number;
  maxGasPrice: bigint;
  slippageBps: number;
  flashFeeBps: number;
  v3FeeCandidates: number[];
}

interface ProcessedKey {
  key: string;
  timestamp: number;
}

export class LiquidationBot {
  provider: JsonRpcProvider;
  comptroller: ComptrollerAdapter;
  priceService?: PriceServiceCompound;
  subgraph: SubgraphCandidates;
  validator?: OnChainValidator;
  wallet?: Wallet;
  processed: Map<string, number> = new Map(); // Idempotence tracking
  
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
    this.log({ event: "init", comptroller: params });
    
    // Safety: verify oracle is valid
    if (!params.oracle || params.oracle === "0x0000000000000000000000000000000000000000") {
      throw new Error("Invalid oracle address from comptroller");
    }
    
    this.priceService = new PriceServiceCompound(this.provider, params.oracle);
    this.validator = new OnChainValidator(this.provider, this.comptroller, this.priceService);
    
    this.log({ 
      event: "bot_ready", 
      simulate: this.config.simulate, 
      execute: this.config.execute,
      wallet: this.wallet?.address 
    });
  }

  async run() {
    await this.init();
    
    while (true) {
      try {
        await this.checkAndLiquidate();
      } catch (err: any) {
        this.log({ event: "bot_error", error: err.message, stack: err.stack });
      }
      
      this.cleanupProcessed();
      
      this.log({ event: "sleep", ms: this.config.checkInterval });
      await new Promise(r => setTimeout(r, this.config.checkInterval));
    }
  }

  async checkAndLiquidate() {
    this.log({ event: "fetch_candidates" });
    const candidates = await this.subgraph.fetch();
    this.log({ event: "candidates_found", count: candidates.length });
    
    if (!this.validator) return;
    
    // Safety: check gas price
    const feeData = await this.provider.getFeeData();
    const gasPrice = feeData.gasPrice || 0n;
    if (gasPrice > this.config.maxGasPrice) {
      this.log({ event: "gas_too_high", gasPrice: gasPrice.toString(), max: this.config.maxGasPrice.toString() });
      return;
    }
    
    let liquidated = 0;
    
    for (const c of candidates) {
      if (liquidated >= this.config.maxLiquidations) break;
      
      const validated = await this.validator.validate(c, this.config.minHealthFactor);
      if (!validated) continue;
      
      this.log({ 
        event: "liquidatable_found", 
        borrower: validated.address, 
        healthFactor: validated.healthFactor.toFixed(4),
        markets: validated.markets.length 
      });
      
      // Choose best debt/collateral pair (largest borrow for now)
      const debtMarket = validated.markets.reduce((prev, curr) => 
        curr.borrowBalance > prev.borrowBalance ? curr : prev
      );
      
      // Find collateral market (any with collateral factor > 0)
      const collMarket = validated.markets.find(m => m.collateralFactor > 0);
      if (!collMarket) {
        this.log({ event: "skip_no_collateral", borrower: validated.address });
        continue;
      }
      
      // Check if already processed recently
      const procKey = `${validated.address}-${debtMarket.kToken}`;
      if (this.isRecentlyProcessed(procKey)) {
        this.log({ event: "skip_recently_processed", borrower: validated.address });
        continue;
      }
      
      // Calculate max repay (closeFactor)
      const params = await this.comptroller.getParams();
      const maxRepay = (debtMarket.borrowBalance * BigInt(Math.floor(params.closeFactor * 1e4))) / 10000n;
      
      if (this.config.simulate) {
        this.log({ 
          event: "simulate_liquidation",
          borrower: validated.address,
          debtToken: debtMarket.kToken,
          collToken: collMarket.kToken,
          repayAmount: maxRepay.toString()
        });
        this.markProcessed(procKey);
        liquidated++;
        continue;
      }
      
      if (!this.config.execute || !this.wallet) {
        this.log({ event: "skip_execute_disabled" });
        continue;
      }
      
      try {
        // Estimate profitability
        const profitable = await this.estimateProfitability(
          validated.address,
          debtMarket,
          collMarket,
          maxRepay,
          params.liqIncentive
        );
        
        if (!profitable.isProfitable) {
          this.log({ 
            event: "skip_unprofitable", 
            borrower: validated.address,
            estimatedPnlUsd: profitable.pnlUsd 
          });
          continue;
        }
        
        this.log({
          event: "executing_liquidation",
          borrower: validated.address,
          debtToken: debtMarket.kToken,
          collToken: collMarket.kToken,
          repayAmount: maxRepay.toString(),
          estimatedPnlUsd: profitable.pnlUsd,
          pool: profitable.pool,
          feeTier: profitable.feeTier
        });
        
        const receipt = await execFlash(
          this.wallet,
          this.config.v3Factory,
          this.config.flashExecutor,
          validated.address,
          debtMarket.kToken,
          debtMarket.underlying,
          collMarket.kToken,
          collMarket.underlying,
          profitable.flashToken,
          maxRepay,
          profitable.minProfit,
          profitable.minOutDebt,
          profitable.minOutColl,
          this.config.v3FeeCandidates
        );
        
        this.log({
          event: "liquidation_success",
          borrower: validated.address,
          tx: receipt.hash,
          gasUsed: receipt.gasUsed?.toString(),
          blockNumber: receipt.blockNumber
        });
        
        this.markProcessed(procKey);
        liquidated++;
        
      } catch (err: any) {
        this.log({ 
          event: "liquidation_error", 
          borrower: validated.address,
          error: err.message 
        });
      }
    }
  }
  
  async estimateProfitability(
    borrower: string,
    debtMarket: any,
    collMarket: any,
    repayAmount: bigint,
    liqIncentive: number
  ): Promise<{
    isProfitable: boolean;
    pnlUsd: number;
    flashToken: string;
    minProfit: bigint;
    minOutDebt: bigint;
    minOutColl: bigint;
    pool?: string;
    feeTier?: number;
  }> {
    // Use debt token as flash token for simplicity
    const flashToken = debtMarket.underlying;
    
    // Calculate seized collateral (repay * liqIncentive)
    const seizedUnderlying = (repayAmount * BigInt(Math.floor(liqIncentive * 1e4))) / 10000n;
    
    // Quote swap paths
    const debtPath = [flashToken, debtMarket.underlying];
    const collPath = [collMarket.underlying, flashToken];
    
    let minOutDebt = 0n;
    let minOutColl = 0n;
    
    try {
      // If debt token == flash token, no swap needed
      if (flashToken.toLowerCase() === debtMarket.underlying.toLowerCase()) {
        minOutDebt = repayAmount;
      } else {
        const outDebt = await quoteOut(this.config.dexRouter, this.provider, debtPath, repayAmount);
        minOutDebt = withSlippage(outDebt, this.config.slippageBps);
      }
      
      // Quote collateral -> flash token
      if (collMarket.underlying.toLowerCase() === flashToken.toLowerCase()) {
        minOutColl = seizedUnderlying;
      } else {
        const outColl = await quoteOut(this.config.dexRouter, this.provider, collPath, seizedUnderlying);
        minOutColl = withSlippage(outColl, this.config.slippageBps);
      }
      
    } catch (err: any) {
      this.log({ event: "quote_error", error: err.message });
      return { 
        isProfitable: false, 
        pnlUsd: 0, 
        flashToken, 
        minProfit: 0n, 
        minOutDebt: 0n, 
        minOutColl: 0n 
      };
    }
    
    // Calculate PnL: collateral received - repay - flash fee
    const flashFee = (repayAmount * BigInt(this.config.flashFeeBps)) / 10000n;
    const totalCost = repayAmount + flashFee;
    const estProfit = minOutColl > totalCost ? minOutColl - totalCost : 0n;
    
    // Convert to USD (use debt token price as proxy)
    const profitUsd = Number(formatUnits(estProfit, debtMarket.decimals)) * 
                      Number(formatUnits(debtMarket.price, 18));
    
    const isProfitable = profitUsd >= this.config.minProfitUsd;
    
    return {
      isProfitable,
      pnlUsd: profitUsd,
      flashToken,
      minProfit: estProfit,
      minOutDebt,
      minOutColl
    };
  }
  
  isRecentlyProcessed(key: string): boolean {
    const lastTime = this.processed.get(key);
    if (!lastTime) return false;
    return Date.now() - lastTime < 60_000; // 60s idempotence window
  }
  
  markProcessed(key: string) {
    this.processed.set(key, Date.now());
  }
  
  cleanupProcessed() {
    const now = Date.now();
    for (const [key, time] of this.processed.entries()) {
      if (now - time > 120_000) { // Cleanup after 2 minutes
        this.processed.delete(key);
      }
    }
  }
  
  log(data: any) {
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), ...data }));
  }
}
