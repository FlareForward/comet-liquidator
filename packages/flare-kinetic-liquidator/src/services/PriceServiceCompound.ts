import { Contract, Provider } from "ethers";
import OracleAbi from "../abi/compoundOracle.json";

const KTOKEN_ABI = ["function symbol() view returns (string)"];

export class PriceServiceCompound {
  c: Contract;
  private unpricedCache: Map<string, number> = new Map(); // kToken -> timestamp
  private readonly CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

  constructor(readonly provider: Provider, readonly oracle: string) {
    this.c = new Contract(oracle, OracleAbi, provider);
  }

  // returns 18-dec USD price
  async priceOf(kToken: string): Promise<string> {
    // Check if market is cached as unpriced
    const cachedTime = this.unpricedCache.get(kToken.toLowerCase());
    if (cachedTime && Date.now() - cachedTime < this.CACHE_TTL_MS) {
      throw new Error(`Market ${kToken} temporarily excluded (no oracle config)`);
    }

    try {
      const p = await this.c.getUnderlyingPrice(kToken);
      return p.toString();
    } catch (err: any) {
      // Enhanced error logging with symbol resolution
      const symbol = await this.getTokenSymbol(kToken);
      const errorMsg = err.reason || err.message || String(err);
      
      // Detect "asset config doesn't exist" errors
      if (errorMsg.includes("asset config doesn't exist") || 
          errorMsg.includes("missing revert data")) {
        console.error(
          `❌ price-miss ${symbol} ${kToken} via oracle=${this.oracle}\n` +
          `   error="${errorMsg}"\n` +
          `   This market lacks oracle configuration. Caching for ${this.CACHE_TTL_MS / 60000} minutes.`
        );
        
        // Cache this market to prevent repeated failures
        this.unpricedCache.set(kToken.toLowerCase(), Date.now());
        throw new Error(`Market ${kToken} (${symbol}) has no oracle config`);
      }
      
      // Other errors - log with symbol but don't cache
      console.error(`❌ price-error ${symbol} ${kToken} via oracle=${this.oracle} error="${errorMsg}"`);
      throw err;
    }
  }

  private async getTokenSymbol(kToken: string): Promise<string> {
    try {
      const token = new Contract(kToken, KTOKEN_ABI, this.provider);
      return await token.symbol();
    } catch {
      return "UNKNOWN";
    }
  }

  // Clear unpriced cache (useful for testing or after oracle updates)
  clearUnpricedCache(): void {
    this.unpricedCache.clear();
  }
}


