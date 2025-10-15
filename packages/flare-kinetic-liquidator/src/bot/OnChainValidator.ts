import { Provider, Contract } from "ethers";
import { ComptrollerAdapter } from "../adapters/ComptrollerAdapter";
import { PriceServiceCompound } from "../services/PriceServiceCompound";
import { borrowUsd18WithOracle } from "../services/price";
import { Candidate } from "../sources/SubgraphCandidates";
import { isDenied } from "../lib/denylist";

export interface ValidatedCandidate extends Candidate {
  healthFactor: number; // legacy field; not used for decision
  liquidity: bigint;
  shortfall: bigint;
  totalBorrowUSD: bigint;
  totalCollateralUSD: bigint;
  assetsIn: string[];
  rpcCalls: number;
  comptroller: string;
}

// Comptroller ABI for on-chain checks
const COMPTROLLER_ABI = [
  "function getAssetsIn(address) view returns (address[])",
  "function getAccountLiquidity(address) view returns (uint256, uint256, uint256)",
  "function oracle() view returns (address)"
];

// CToken ABI
const CTOKEN_ABI = [
  "function underlying() view returns (address)",
  "function borrowBalanceStored(address) view returns (uint256)",
  "function symbol() view returns (string)"
];

// Oracle ABI
const ORACLE_ABI = [
  "function getUnderlyingPrice(address) view returns (uint256)"
];

// ERC20 ABI
const ERC20_ABI = [
  "function decimals() view returns (uint8)"
];

export class OnChainValidator {
  private rpcCallCount = 0;
  private comptrollerContract: Contract;
  private oracleContract: Contract | null = null;
  private debugCount = 0;
  private hfStats: { healthFactors: number[]; watchlistCount: number; liquidatableCount: number } = {
    healthFactors: [],
    watchlistCount: 0,
    liquidatableCount: 0
  };

  constructor(
    readonly provider: Provider,
    readonly comptroller: ComptrollerAdapter,
    readonly priceService: PriceServiceCompound
  ) {
    // Assert HF_SOURCE is chain
    if (process.env.HF_SOURCE && process.env.HF_SOURCE !== "chain") {
      throw new Error(`HF_SOURCE must be 'chain', got '${process.env.HF_SOURCE}'`);
    }
    
    this.comptrollerContract = new Contract(
      comptroller.comptroller,
      COMPTROLLER_ABI,
      provider
    );
  }

  async init() {
    // Get oracle address from comptroller
    const resolvedOracle = await this.comptrollerContract.oracle();
    this.rpcCallCount++;
    
    // ===== ORACLE VALIDATION & OVERRIDE =====
    // Validate that resolved oracle matches expected oracle (if set)
    const expectedOracle = process.env.KINETIC_ORACLE?.toLowerCase();
    const oracleAddr = (expectedOracle || resolvedOracle).toLowerCase();
    
    if (expectedOracle && expectedOracle !== resolvedOracle.toLowerCase()) {
      throw new Error(
        `❌ Oracle mismatch in OnChainValidator!\n` +
        `   Environment KINETIC_ORACLE: ${expectedOracle}\n` +
        `   Comptroller.oracle():       ${resolvedOracle.toLowerCase()}\n` +
        `   This is a configuration error. Ensure KINETIC_ORACLE matches Comptroller's oracle.`
      );
    }
    // ===== END ORACLE VALIDATION =====
    
    this.oracleContract = new Contract(oracleAddr, ORACLE_ABI, this.provider);
    
    // Log excluded markets once at startup
    const excluded = (process.env.EXCLUDED_MARKETS || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    
    if (excluded.length > 0) {
      console.warn(`⚠️  [OnChainValidator] Excluded ${excluded.length} market(s) with missing oracle feeds:`);
      excluded.forEach(addr => console.warn(`   - ${addr}`));
      console.warn(`   Fix oracle mapping and remove from EXCLUDED_MARKETS to re-enable`);
    }
    
    console.log(
      `[OnChainValidator] Comptroller=${this.comptroller.comptroller} ` +
      `Oracle=${oracleAddr} (${expectedOracle ? 'env_override' : 'comptroller_resolved'})`
    );
  }

  getRpcCallCount(): number {
    return this.rpcCallCount;
  }

  resetRpcCallCount(): void {
    this.rpcCallCount = 0;
  }

  getHfStats() {
    const hfs = this.hfStats.healthFactors.sort((a, b) => a - b);
    const min = hfs.length > 0 ? hfs[0] : null;
    const p5 = hfs.length > 0 ? hfs[Math.floor(hfs.length * 0.05)] : null;
    const p50 = hfs.length > 0 ? hfs[Math.floor(hfs.length * 0.50)] : null;
    
    return {
      total: hfs.length,
      min,
      p5,
      p50,
      watchlistCount: this.hfStats.watchlistCount,
      liquidatableCount: this.hfStats.liquidatableCount
    };
  }

  resetHfStats(): void {
    this.hfStats = {
      healthFactors: [],
      watchlistCount: 0,
      liquidatableCount: 0
    };
  }

  /**
   * Calculate borrow USD using proper oracle price scaling
   * Formula: borrowUSD = (borrowRaw * priceMantissa) / 1e36
   * 
   * Oracle prices are in 1e(36 - uDecimals) format
   * Borrows are in 1e(uDecimals) format
   * Result is in 1e18 USD
   */
  private async borrowUsdFor(user: string, cToken: string): Promise<{ borrowUsd: bigint; decimals: number; price: bigint; borrow: bigint }> {
    if (!this.oracleContract) throw new Error("Oracle not initialized");
    
    const cTokenContract = new Contract(cToken, CTOKEN_ABI, this.provider);
    
    // Get underlying address
    const underlying = await cTokenContract.underlying();
    this.rpcCallCount++;
    
    // Get underlying decimals (for logging/debugging)
    const underlyingContract = new Contract(underlying, ERC20_ABI, this.provider);
    const decimals = await underlyingContract.decimals();
    this.rpcCallCount++;
    
    // Get oracle price - PASS CTOKEN NOT UNDERLYING!
    // Oracle interface: getUnderlyingPrice(address cToken) returns uint256
    const priceMantissa = BigInt(await this.oracleContract.getUnderlyingPrice(cToken));
    this.rpcCallCount++;
    
    // Check for missing price feed
    if (priceMantissa === 0n) {
      console.warn(`[OnChainValidator] Missing price feed for cToken ${cToken}`);
      return { borrowUsd: 0n, decimals, price: 0n, borrow: 0n };
    }
    
    // Get borrow balance (1e(uDecimals))
    const borrowRaw = BigInt(await cTokenContract.borrowBalanceStored(user));
    this.rpcCallCount++;
    
    // Calculate USD: (borrowRaw * priceMantissa) / 1e36
    const borrowUsd = (borrowRaw * priceMantissa) / 10n**36n;
    
    return { borrowUsd, decimals, price: priceMantissa, borrow: borrowRaw };
  }

  /**
   * Debug logging for one user to verify USD math
   */
  private async debugUser(user: string) {
    if (!this.oracleContract) return;
    
    console.log(`\n=== DEBUG USER ${user} ===`);
    const assets = await this.comptrollerContract.getAssetsIn(user);
    console.log(`assetsIn: ${JSON.stringify(assets)}`);
    
    for (const c of assets) {
      try {
        const cTokenContract = new Contract(c, CTOKEN_ABI, this.provider);
        const u = await cTokenContract.underlying();
        
        const underlyingContract = new Contract(u, ERC20_ABI, this.provider);
        const [udec, price, borrow] = await Promise.all([
          underlyingContract.decimals(),
          this.oracleContract.getUnderlyingPrice(c),
          cTokenContract.borrowBalanceStored(user),
        ]);
        
        const usd = (BigInt(borrow) * BigInt(price)) / 10n**36n;
        
        console.log({
          cToken: c,
          underlying: u,
          decimals: udec,
          price: price.toString(),
          borrowRaw: borrow.toString(),
          borrowUSD: usd.toString()
        });
      } catch (err: any) {
        console.error(`Debug failed for cToken ${c}: ${err.message}`);
      }
    }
    
    const [, liq, short] = await this.comptrollerContract.getAccountLiquidity(user);
    console.log({ liquidity: liq.toString(), shortfall: short.toString() });
    console.log(`=== END DEBUG ===\n`);
  }

  async validate(candidate: Candidate, minHealthFactor: number): Promise<ValidatedCandidate | null> {
    // Early exit for denylisted addresses - saves RPC calls
    if (isDenied(candidate.address)) {
      return null;
    }
    
    // Debug first few candidates
    const shouldDebug = this.debugCount < 2;
    if (shouldDebug) {
      this.debugCount++;
    }
    
    try {
      // Step 1: Get user's markets (getAssetsIn)
      // Try multiple comptrollers if UNITROLLER_LIST provided
      const unitrollerList = (process.env.UNITROLLER_LIST || this.comptroller.comptroller)
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);
      
      let scope: { compAddr: string; assets: string[]; oracle: string } | null = null;
      for (const compAddr of unitrollerList) {
        const comp = new Contract(compAddr, [
          "function getAssetsIn(address) view returns (address[])",
          "function oracle() view returns (address)"
        ], this.provider);
        try {
          const assets = await comp.getAssetsIn(candidate.address);
          this.rpcCallCount++;
          if (assets.length) {
            const oracle = await comp.oracle();
            this.rpcCallCount++;
            scope = { compAddr, assets, oracle };
            break;
          }
        } catch {}
      }
      
      const assetsIn = scope?.assets || [];
      
      if (assetsIn.length === 0) {
        console.log(`[OnChainValidator] ${candidate.address}: no_assets_in (not using any markets)`);
        return null;
      }

      // Step 2: Calculate total borrow USD using proper price normalization
      let totalBorrowUSD = 0n;
      const borrowDetails: Array<{ cToken: string; borrowUSD: bigint; decimals: number; price: bigint; borrow: bigint }> = [];
      
      const excluded = (process.env.EXCLUDED_MARKETS || "")
        .split(",")
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);

      for (const cToken of assetsIn) {
        if (excluded.includes(cToken.toLowerCase())) {
          // Silently skip - already logged at startup
          continue;
        }
        try {
          const usd = await borrowUsd18WithOracle(candidate.address, cToken, this.provider, scope!.oracle);
          this.rpcCallCount += 2; // price + borrow
          
          if (usd > 0n) {
            totalBorrowUSD += usd;
            borrowDetails.push({ 
              cToken, 
              borrowUSD: usd,
              decimals: 0,
              price: 0n,
              borrow: 0n
            });
          }
        } catch (err: any) {
          // Enhanced error logging with symbol resolution
          const errorMsg = err.reason || err.message || String(err);
          
          // Try to get the token symbol for better logging
          let symbol = "UNKNOWN";
          try {
            const ct = new Contract(cToken, CTOKEN_ABI, this.provider);
            symbol = await ct.symbol();
          } catch {
            // Ignore symbol fetch errors
          }
          
          // Log with symbol and oracle address
          if (errorMsg.includes("asset config doesn't exist") || 
              errorMsg.includes("missing revert data")) {
            console.error(
              `❌ price-miss ${symbol} ${cToken} via oracle=${scope!.oracle}\n` +
              `   borrower=${candidate.address}\n` +
              `   error="${errorMsg}"\n` +
              `   Add to EXCLUDED_MARKETS or fix oracle mapping on-chain`
            );
          } else {
            console.warn(`[OnChainValidator] ${candidate.address}: borrow calc failed for ${symbol} ${cToken}: ${errorMsg}`);
          }
        }
      }
      
      // Per-user telemetry (first few)
      if (shouldDebug) {
        console.log(`[OnChainValidator] ${candidate.address} scope`, {
          assetsIn: assetsIn.length,
          comptroller: scope?.compAddr,
          oracle: scope?.oracle,
          rpc_calls: this.rpcCallCount
        });
        if (borrowDetails.length > 0) {
          console.log(`[OnChainValidator] ${candidate.address} borrow details`, 
            borrowDetails.map(d => ({
              cToken: d.cToken,
              borrowUSD: d.borrowUSD.toString()
            }))
          );
        }
      }

      // Apply minimum debt threshold
      const minDebtUSD = BigInt(process.env.DEBT_MIN_USD || "1") * (10n ** 18n);
      
      if (totalBorrowUSD === 0n) {
        console.log(`[OnChainValidator] ${candidate.address}: no_debt_chain (assetsIn=${assetsIn.length}, totalBorrowUSD=0)`);
        return null;
      }

      if (totalBorrowUSD < minDebtUSD) {
        console.log(`[OnChainValidator] ${candidate.address}: debt_too_small (assetsIn=${assetsIn.length}, totalBorrowUSD=${totalBorrowUSD}, min=${minDebtUSD})`);
        return null;
      }

      console.log(`[OnChainValidator] ${candidate.address}: has_debt (assetsIn=${assetsIn.length}, totalBorrowUSD=${totalBorrowUSD.toString()})`);

      // Debug logging for first few candidates
      if (shouldDebug) {
        await this.debugUser(candidate.address);
      }

      // Step 3: Get account liquidity (error, liquidity, shortfall) from the owning comptroller
      const owningComp = new Contract(scope!.compAddr, ["function getAccountLiquidity(address) view returns (uint256,uint256,uint256)"], this.provider);
      const [error, liquidity, shortfall] = await owningComp.getAccountLiquidity(candidate.address);
      this.rpcCallCount++;

      if (error !== 0n) {
        console.error(`[OnChainValidator] ${candidate.address}: getAccountLiquidity error=${error}`);
        return null;
      }

      // Calculate HF for telemetry: HF = liquidity / (liquidity + shortfall)
      const totalValue = liquidity + shortfall;
      const healthFactor = totalValue === 0n ? 0 : Number(liquidity) / Number(totalValue);
      
      // Track HF stats
      this.hfStats.healthFactors.push(healthFactor);
      if (healthFactor < 1.05 && healthFactor >= 1.0) {
        this.hfStats.watchlistCount++;
      }
      if (shortfall > 0n) {
        this.hfStats.liquidatableCount++;
      }

      // shortfall > 0 means liquidatable (HF < 1.0)
      if (shortfall === 0n) {
        console.log(`[OnChainValidator] ${candidate.address}: healthy (HF=${healthFactor.toFixed(4)}, liquidity=${liquidity.toString()})`);
        return null;
      }

      // Per-user HF telemetry
      console.log(JSON.stringify({
        event: "HF",
        user: candidate.address,
        comp: scope!.compAddr,
        assetsIn: assetsIn.length,
        rpc_calls: this.rpcCallCount,
        usd: totalBorrowUSD.toString(),
        liq: liquidity.toString(),
        short: shortfall.toString()
      }));

      return {
        ...candidate,
        healthFactor: 0,
        liquidity,
        shortfall,
        totalBorrowUSD,
        totalCollateralUSD: liquidity,
        assetsIn,
        rpcCalls: this.rpcCallCount,
        comptroller: scope!.compAddr
      };

    } catch (err: any) {
      console.error(`[OnChainValidator] ${candidate.address}: validation error: ${err.message}`);
      return null;
    }
  }
}

