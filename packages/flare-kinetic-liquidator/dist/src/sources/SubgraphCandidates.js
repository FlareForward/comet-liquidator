"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubgraphCandidates = void 0;
const axios_1 = __importDefault(require("axios"));
class SubgraphCandidates {
    constructor(url, timeout = 6000, retries = 5, limit = 200) {
        this.url = url;
        this.timeout = timeout;
        this.retries = retries;
        this.limit = limit;
    }
    async fetch() {
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
                const resp = await axios_1.default.post(this.url, { query, variables: { limit: this.limit } }, { timeout: this.timeout });
                const accounts = resp.data?.data?.accounts || [];
                return accounts.map((a) => ({
                    address: a.id,
                    totalBorrow: a.totalBorrowValueInUSD,
                    totalCollateral: a.totalCollateralValueInUSD
                }));
            }
            catch (err) {
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
exports.SubgraphCandidates = SubgraphCandidates;
