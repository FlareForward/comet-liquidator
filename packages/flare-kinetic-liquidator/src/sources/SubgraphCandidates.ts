import axios from "axios";
import { isDenied } from "../lib/denylist";

export interface Candidate {
  address: string;
  totalBorrow: string;
  totalCollateral: string;
  healthFactor?: number;
}

export class SubgraphCandidates {
  constructor(
    readonly url: string,
    readonly timeout: number = 6000,
    readonly retries: number = 5,
    readonly pageSize: number = 1000
  ) {}

  /**
   * Fetch all borrowers from subgraph by querying markets and their borrowers.
   * This is more reliable than account-level queries for Kinetic subgraphs.
   */
  async fetch(): Promise<Candidate[]> {
    if (!this.url || this.url.trim().length === 0) {
      console.warn(`[SubgraphCandidates] URL empty; subgraph disabled`);
      return [];
    }
    const borrowerSet = new Set<string>();
    let skip = 0;
    let hasMore = true;
    
    console.log(`[SubgraphCandidates] Starting fetch with pageSize=${this.pageSize}`);
    
    while (hasMore) {
      const query = `
        query BorrowerCandidates($pageSize: Int!, $skip: Int!) {
          accountMarkets(first: $pageSize, skip: $skip, where: { storedBorrowBalance_gt: "0" }) {
            account { id }
            market { id }
            storedBorrowBalance
          }
        }
      `;
      
      try {
        const resp = await this.executeQuery(query, { pageSize: this.pageSize, skip });
        const accountMarkets = resp.data?.data?.accountMarkets || [];
        
        if (accountMarkets.length === 0) {
          console.log(`[SubgraphCandidates] No accountMarkets returned, trying fallback query`);
          return this.fetchFallback();
        }
        
        let addedThisPage = 0;
        for (const am of accountMarkets) {
          const addr = (am.account?.id || "").toLowerCase();
          if (!addr) continue;
          
          // Filter denylisted addresses early
          if (isDenied(addr)) {
            continue;
          }
          
          if (!borrowerSet.has(addr)) {
            borrowerSet.add(addr);
            addedThisPage++;
          }
        }
        
        console.log(`[SubgraphCandidates] Page skip=${skip}: found ${addedThisPage} new borrowers (total: ${borrowerSet.size})`);
        
        // If we got fewer results than pageSize, we're done
        hasMore = addedThisPage >= this.pageSize;
        skip += this.pageSize;
        
        // Safety limit: don't paginate forever
        if (skip > 50000) {
          console.warn(`[SubgraphCandidates] Hit safety limit at skip=${skip}, stopping pagination`);
          break;
        }
        
      } catch (err: any) {
        const code = err?.response?.status || err?.code || err?.message;
        if (code === 404 || err?.message === "SUBGRAPH_404") {
          console.error(`[SubgraphCandidates] 404 at ${this.url}. Disabling subgraph for this run.`);
        } else {
          console.error(`[SubgraphCandidates] Error fetching page skip=${skip}:`, err.message);
        }
        // If first page fails, rethrow so caller can trigger chain sweep immediately
        if (skip === 0) throw err;
        hasMore = false;
      }
    }
    
    console.log(`[SubgraphCandidates] Fetch complete: ${borrowerSet.size} unique borrowers`);
    
    // Return as Candidate array
    return Array.from(borrowerSet).map(address => ({
      address,
      totalBorrow: "0", // Will be calculated on-chain
      totalCollateral: "0"
    }));
  }
  
  /**
   * Fallback query for subgraphs with different schema
   */
  private async fetchFallback(): Promise<Candidate[]> {
    console.log(`[SubgraphCandidates] Using fallback query`);
    
    const query = `
      query GetAccounts($pageSize: Int!) {
        accounts(
          first: $pageSize, 
          orderBy: totalBorrowValueInUSD, 
          orderDirection: desc, 
          where: { totalBorrowValueInUSD_gt: "0" }
        ) {
          id
          totalBorrowValueInUSD
          totalCollateralValueInUSD
        }
      }
    `;
    
    try {
      const resp = await this.executeQuery(query, { pageSize: this.pageSize });
      const accounts = resp.data?.data?.accounts || [];
      
      return accounts
        .filter((a: any) => !isDenied(a.id))
        .map((a: any) => ({
          address: a.id,
          totalBorrow: a.totalBorrowValueInUSD || "0",
          totalCollateral: a.totalCollateralValueInUSD || "0"
        }));
    } catch (err: any) {
      console.error(`[SubgraphCandidates] Fallback query failed:`, err.message);
      return [];
    }
  }
  
  /**
   * Execute a GraphQL query with retries
   */
  private async executeQuery(query: string, variables: any): Promise<any> {
    for (let attempt = 1; attempt <= this.retries; attempt++) {
      try {
        const resp = await axios.post(
          this.url, 
          { query, variables }, 
          { 
            timeout: this.timeout,
            headers: { "Content-Type": "application/json" }
          }
        );
        
        if (resp.status === 404) {
          const e: any = new Error("SUBGRAPH_404");
          e.code = 404;
          throw e;
        }

        if (resp.data?.errors) {
          throw new Error(`GraphQL errors: ${JSON.stringify(resp.data.errors)}`);
        }
        
        return resp;
      } catch (err: any) {
        if (err?.code === 404 || err?.message === "SUBGRAPH_404" || err?.response?.status === 404) {
          // Do not retry 404, bubble up immediately
          throw err;
        }
        if (attempt === this.retries) {
          throw err;
        }
        console.warn(`[SubgraphCandidates] Attempt ${attempt}/${this.retries} failed, retrying...`);
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
    throw new Error("Query failed after all retries");
  }
}

