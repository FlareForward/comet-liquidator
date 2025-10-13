import axios from "axios";

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
    readonly limit: number = 200
  ) {}

  async fetch(): Promise<Candidate[]> {
    const query = `
      query GetUnderwaterBorrowers($limit: Int!) {
        accounts(first: $limit, orderBy: totalBorrowValueInUSD, orderDirection: desc, where: { totalBorrowValueInUSD_gt: "0" }) {
          id
          totalBorrowValueInUSD
          totalCollateralValueInUSD
        }
      }
    `;
    
    for (let attempt = 1; attempt <= this.retries; attempt++) {
      try {
        const resp = await axios.post(this.url, { query, variables: { limit: this.limit } }, { timeout: this.timeout });
        const accounts = resp.data?.data?.accounts || [];
        return accounts.map((a: any) => ({
          address: a.id,
          totalBorrow: a.totalBorrowValueInUSD,
          totalCollateral: a.totalCollateralValueInUSD
        }));
      } catch (err: any) {
        if (attempt === this.retries) {
          console.error(`Subgraph fetch failed after ${this.retries} retries:`, err.message);
          return [];
        }
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
    return [];
  }
}

