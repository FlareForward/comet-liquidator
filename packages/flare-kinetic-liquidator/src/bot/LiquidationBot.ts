import { JsonRpcProvider, Wallet, formatUnits, parseUnits, Contract } from "ethers";
import { ComptrollerAdapter } from "../adapters/ComptrollerAdapter";
import { PriceServiceCompound } from "../services/PriceServiceCompound";
import { SubgraphCandidates } from "../sources/SubgraphCandidates";
import { chainBorrowerSweep } from "../sources/ChainCandidates";
import { OnChainValidator } from "./OnChainValidator";
import { execFlash } from "../strategy/FlashRepayStrategy";
import { quoteOut, withSlippage } from "../services/Quotes";
import { flashProfitToQuote } from "../services/ProfitGuard";
import { calcRepayAmount, roughSeizedUnderlying } from "../services/LiquidationMath";
import { isDenied, getDenylistSize, watchDenylist } from "../lib/denylist";
import ComptrollerAbi from "../abi/comptroller.json";

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
  candidateSource: string;
  useSubgraph: boolean;
  subgraphPageSize: number;
  subgraphTimeout: number;
  subgraphRetries: number;
  candidateLimit: number;
  chainFallbackOnEmpty: boolean;
  chainSweepLookback: number;
  blocksPerChunk: number;
  blockLookback: number;
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
  markets: string[] = [];
  
  constructor(readonly config: BotConfig) {
    this.provider = new JsonRpcProvider(config.rpcUrl);
    this.comptroller = new ComptrollerAdapter(this.provider, config.comptroller);
    this.subgraph = new SubgraphCandidates(
      config.subgraphUrl,
      config.subgraphTimeout,
      config.subgraphRetries,
      config.subgraphPageSize
    );
    
    if (config.privateKey) {
      this.wallet = new Wallet(config.privateKey, this.provider);
    }
  }

  async init() {
    // Assert HF_SOURCE is chain
    const hfSource = process.env.HF_SOURCE || "chain";
    if (hfSource !== "chain") {
      throw new Error(`HF_SOURCE must be 'chain', got '${hfSource}'`);
    }
    
    this.log({ event: "init_start", HF_SOURCE: hfSource, candidate_source: this.config.candidateSource });
    
    // Enable hot-reload of denylist if DENYLIST_WATCH=true
    if (process.env.DENYLIST_WATCH === "true") {
      watchDenylist();
    }
    
    this.log({ event: "denylist_loaded", count: getDenylistSize() });
    
    const prov = this.provider;
    const list = (process.env.UNITROLLER_LIST || this.config.comptroller)
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    
    let selected: { addr: string; closeFactor: bigint; liqIncentive: bigint; oracle: string } | null = null;

    for (const addr of list) {
      const c = new Contract(addr, ComptrollerAbi, prov);
      try {
        const [cf, li, orc] = await Promise.all([
          c.closeFactorMantissa(),
          c.liquidationIncentiveMantissa(),
          c.oracle()
        ]);
        if (orc && orc !== "0x0000000000000000000000000000000000000000" && cf > 0n && li > 0n) {
          selected = { addr, closeFactor: BigInt(cf), liqIncentive: BigInt(li), oracle: orc };
          this.log({ event: "valid_proxy_found", addr, oracle: orc });
          break;
        }
      } catch (err: any) {
        this.log({ event: "proxy_check_failed", addr, error: err.message });
      }
    }

    if (!selected) throw new Error("No valid Comptroller proxy found in UNITROLLER_LIST");

    // ===== ORACLE SELECTION =====
    // Always use Comptroller-resolved oracle, ignore any env override
    const resolvedOracle = selected.oracle.toLowerCase();
    const finalOracle = resolvedOracle;
    
    this.log({ 
      event: "oracle_selected",
      source: "comptroller_resolved",
      oracle: finalOracle,
      comptroller: selected.addr
    });
    
    // Update selected to use validated oracle
    selected.oracle = finalOracle;
    // ===== END ORACLE SELECTION =====

    // Update config to use the valid proxy
    this.config.comptroller = selected.addr;
    this.comptroller = new ComptrollerAdapter(prov, selected.addr);
    
    this.priceService = new PriceServiceCompound(prov, selected.oracle);
    this.validator = new OnChainValidator(prov, this.comptroller, this.priceService);
    
    // Initialize validator (fetches oracle address)
    await this.validator.init();
    
    // Fetch all markets for chain-based candidate discovery
    this.markets = await this.comptroller.getAllMarkets();
    
    // Verify markets are discovered
    if (this.markets.length === 0) {
      throw new Error("getAllMarkets() returned 0 markets - check comptroller address");
    }
    
    // Log all markets for verification
    this.log({ 
      event: "markets_discovered",
      count: this.markets.length,
      markets: this.markets
    });
    
    const excludedMarkets = (process.env.EXCLUDED_MARKETS || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    
    this.log({ 
      event: "bot_ready",
      comptroller: selected.addr,
      oracle: selected.oracle,
      closeFactor: selected.closeFactor.toString(),
      liqIncentive: selected.liqIncentive.toString(),
      markets: this.markets.length,
      excluded_markets: excludedMarkets.length,
      excluded_list: excludedMarkets.length > 0 ? excludedMarkets : undefined,
      HF_SOURCE: process.env.HF_SOURCE || "chain",
      candidate_source: this.config.candidateSource,
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
    this.log({ 
      event: "fetch_candidates_start", 
      source: this.config.candidateSource,
      useSubgraph: this.config.useSubgraph 
    });
    let candidates: any[] = [];
    
    // Primary: Subgraph discovery (if enabled)
    if (this.config.useSubgraph) {
      try {
        candidates = await this.subgraph.fetch();
        this.log({ event: "subgraph_candidates", count: candidates.length });
        
        // Apply candidate limit if set
        if (this.config.candidateLimit > 0 && candidates.length > this.config.candidateLimit) {
          this.log({ 
            event: "candidate_limit_applied", 
            before: candidates.length, 
            after: this.config.candidateLimit 
          });
          candidates = candidates.slice(0, this.config.candidateLimit);
        }
      } catch (err: any) {
        this.log({ event: "subgraph_error", error: err.message });
      }
    }
    
    // Fallback: Chain-based discovery (if enabled and subgraph returned nothing)
    const shouldFallback = (
      candidates.length === 0 && 
      this.config.chainFallbackOnEmpty && 
      this.config.blockLookback > 0
    );
    
    if (shouldFallback) {
      this.log({ 
        event: "chain_fallback_triggered", 
        reason: "subgraph returned no candidates",
        willScan: this.config.blockLookback + " blocks"
      });
      const tip = await this.provider.getBlockNumber();
      const fromBlock = Math.max(0, tip - this.config.blockLookback);
      
      this.log({ 
        event: "chain_sweep_start", 
        fromBlock, 
        toBlock: tip, 
        markets: this.markets.length,
        chunkSize: this.config.blocksPerChunk
      });
      
      try {
        const borrowers = await chainBorrowerSweep(this.provider, this.markets, fromBlock, tip);
        
        candidates = borrowers.map(addr => ({
          address: addr,
          totalBorrow: "0", // Will be calculated on-chain
          totalCollateral: "0"
        }));
        
        this.log({ event: "chain_candidates_found", count: candidates.length });
      } catch (err: any) {
        this.log({ event: "chain_sweep_error", error: err.message });
      }
    } else if (candidates.length === 0 && !this.config.chainFallbackOnEmpty) {
      this.log({ 
        event: "no_candidates", 
        note: "Chain fallback is disabled (CHAIN_FALLBACK_ON_EMPTY=0)"
      });
    }
    
    // Filter out denylisted candidates (double-check, subgraph already filters)
    const beforeDenylist = candidates.length;
    candidates = candidates.filter(c => !isDenied(c.address));
    const filtered = beforeDenylist - candidates.length;
    
    if (filtered > 0) {
      this.log({ event: "denylist_filtered", count: filtered });
    }
    
    this.log({ event: "total_candidates", count: candidates.length });
    
    if (!this.validator) return;
    
    // Reset RPC call counter and HF stats for this batch
    this.validator.resetRpcCallCount();
    this.validator.resetHfStats();
    
    // Safety: check gas price (can be disabled via DISABLE_GAS_GUARD)
    const gasGuardDisabled = process.env.DISABLE_GAS_GUARD === "1" || process.env.DISABLE_GAS_GUARD === "true";
    if (!gasGuardDisabled) {
      const feeData = await this.provider.getFeeData();
      const gasPrice = feeData.gasPrice || 0n;
      if (gasPrice > this.config.maxGasPrice) {
        this.log({ event: "gas_too_high", gasPrice: gasPrice.toString(), max: this.config.maxGasPrice.toString() });
        return;
      }
    } else {
      this.log({ event: "gas_guard_disabled" });
    }
    
    let liquidated = 0;
    let validated_count = 0;
    let no_debt_count = 0;
    let healthy_count = 0;
    let error_count = 0;
    
    for (const c of candidates) {
      if (liquidated >= this.config.maxLiquidations) break;
      
      const validated = await this.validator.validate(c, this.config.minHealthFactor);
      
      if (!validated) {
        // Check logs to categorize
        // These counters are approximate since we don't return reason codes
        continue;
      }
      
      validated_count++;
      
      this.log({ 
        event: "liquidatable_found", 
        borrower: validated.address, 
        shortfall: validated.shortfall.toString(),
        liquidity: validated.liquidity.toString(),
        totalBorrowUSD: validated.totalBorrowUSD.toString(),
        comptroller: validated.comptroller,
        assetsIn: validated.assetsIn.length
      });
      
      // Market selection: pick repay market from user's actual borrows
      const excludedSet = new Set((process.env.EXCLUDED_MARKETS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean));
      const eligibleMarkets = validated.assetsIn.filter(m => !excludedSet.has(m.toLowerCase()));
      
      if (eligibleMarkets.length === 0) {
        this.log({ event: "skip_no_eligible_markets", borrower: validated.address });
        continue;
      }
      
      // Find first market with non-zero borrow balance
      let selectedRepayMarket: string | null = null;
      for (const market of eligibleMarkets) {
        try {
          const cToken = new Contract(market, ["function borrowBalanceStored(address) view returns (uint256)"], this.provider);
          const debt = await cToken.borrowBalanceStored(validated.address);
          if (debt > 0n) {
            selectedRepayMarket = market;
            this.log({ 
              event: "market_selected", 
              borrower: validated.address, 
              repay_market: market, 
              debt: debt.toString(),
              comptroller: validated.comptroller
            });
            break;
          }
        } catch (err: any) {
          this.log({ event: "market_check_failed", market, error: err.message });
        }
      }
      
      if (!selectedRepayMarket) {
        this.log({ event: "skip_no_debt_in_eligible_markets", borrower: validated.address, checked: eligibleMarkets.length });
        continue;
      }
      
      // Skip execution if SIMULATE=true or EXECUTE=false
      if (this.config.simulate || !this.config.execute) {
        this.log({ 
          event: "simulate_skip_execution", 
          borrower: validated.address,
          repay_market: selectedRepayMarket,
          simulate: this.config.simulate,
          execute: this.config.execute
        });
        liquidated++; // count as processed
        continue;
      }
      
      // Execute liquidation
      this.log({ 
        event: "executing_liquidation", 
        borrower: validated.address,
        repay_market: selectedRepayMarket,
        comptroller: validated.comptroller
      });
      
      // TODO: Wire actual execution via execFlash once profit estimation is ready
      this.log({ 
        event: "execution_pending", 
        borrower: validated.address,
        note: "Profit estimation and flash execution not yet wired"
      });
      liquidated++;
      continue;
    }
    
    // Log batch summary with RPC call count
    const rpcCalls = this.validator.getRpcCallCount();
    this.log({
      event: "validation_batch_complete",
      candidates_checked: candidates.length,
      liquidatable_found: validated_count,
      rpc_calls: rpcCalls,
      avg_rpc_per_candidate: candidates.length > 0 ? Math.floor(rpcCalls / candidates.length) : 0
    });
    
    // Log HF distribution telemetry
    const hfStats = this.validator.getHfStats();
    if (hfStats.total > 0) {
      this.log({
        event: "hf_sample",
        total_checked: hfStats.total,
        min_hf: hfStats.min?.toFixed(4) || null,
        p5_hf: hfStats.p5?.toFixed(4) || null,
        p50_hf: hfStats.p50?.toFixed(4) || null,
        watchlist_count: hfStats.watchlistCount,
        liquidatable_count: hfStats.liquidatableCount
      });
      
      // Alert if accounts are approaching liquidation threshold
      if (hfStats.watchlistCount > 0) {
        this.log({
          event: "watchlist_alert",
          count: hfStats.watchlistCount,
          note: `${hfStats.watchlistCount} account(s) with HF between 1.0 and 1.05 (near liquidation)`
        });
      }
    }
    
    // Guard: If we processed candidates but made 0 RPC calls, something is wrong
    if (candidates.length > 0 && rpcCalls === 0) {
      this.log({
        event: "CRITICAL_ERROR",
        message: "HF chain read disabled - Processed candidates but made 0 RPC calls!",
        candidates_processed: candidates.length
      });
      throw new Error("HF chain read disabled - aborting batch");
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
    // Use PRIMARY_FLASH_FALLBACK or WFLR as flash token
    const flashToken = process.env.PRIMARY_FLASH_FALLBACK || process.env.WFLR || debtMarket.underlying;
    const quoteToken = process.env.PAYOUT_QUOTE_TOKEN || process.env.USDT0!;
    
    // Calculate seized collateral using liquidation math
    const liqIncentiveMantissa = BigInt(Math.floor(liqIncentive * 1e18));
    const seizedUnderlying = roughSeizedUnderlying(repayAmount, liqIncentiveMantissa);
    
    // Quote swap paths
    const debtPath = [flashToken, debtMarket.underlying];
    const collPath = [collMarket.underlying, flashToken];
    
    let minOutDebt = 0n;
    let minOutColl = 0n;
    
    try {
      // 1) Min-out for flash -> debt
      if (flashToken.toLowerCase() === debtMarket.underlying.toLowerCase()) {
        minOutDebt = repayAmount;
      } else {
        const outDebt = await quoteOut(this.config.dexRouter, this.provider, debtPath, repayAmount);
        minOutDebt = withSlippage(outDebt, this.config.slippageBps);
      }
      
      // 2) Min-out for collateral -> flash
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
    
    // 3) Calculate PnL: collateral received - repay - flash fee
    const flashFee = (repayAmount * BigInt(this.config.flashFeeBps)) / 10000n;
    const totalCost = repayAmount + flashFee;
    const estProfitFlash = minOutColl > totalCost ? minOutColl - totalCost : 0n;
    
    if (estProfitFlash <= 0n) {
      return {
        isProfitable: false,
        pnlUsd: 0,
        flashToken,
        minProfit: 0n,
        minOutDebt,
        minOutColl
      };
    }
    
    // 4) Convert profit to USD-like quote token
    const estProfitQuote = await flashProfitToQuote(
      this.provider, 
      this.config.dexRouter, 
      flashToken, 
      estProfitFlash, 
      quoteToken
    );
    
    // Assume quote token is 6-decimal (USDT-like) for USD comparison
    const profitUsd = Number(formatUnits(estProfitQuote, 6));
    const isProfitable = profitUsd >= this.config.minProfitUsd;
    
    return {
      isProfitable,
      pnlUsd: profitUsd,
      flashToken,
      minProfit: estProfitFlash,
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
