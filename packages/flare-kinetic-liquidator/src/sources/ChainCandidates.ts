import { Contract, Provider } from "ethers";
import cTokenAbi from "../abi/ctoken.json";

export async function chainBorrowerSweep(
  prov: Provider,
  kTokens: string[],
  fromBlock: number,
  toBlock: number,
  chunk: number = Number(process.env.BLOCK_CHUNK || "2000")
): Promise<string[]> {
  const seen = new Set<string>();
  
  console.log(`[ChainSweep] Scanning ${kTokens.length} markets from block ${fromBlock} to ${toBlock} (chunk=${chunk})`);
  
  for (let start = fromBlock; start <= toBlock; start += chunk) {
    const end = Math.min(start + chunk - 1, toBlock);
    
    console.log(`[ChainSweep] Processing blocks ${start} to ${end}`);
    
    for (const k of kTokens) {
      try {
        const c = new Contract(k, cTokenAbi, prov);
        const ev = c.getEvent("Borrow");
        const logs = await c.queryFilter(ev, start, end);
        
        for (const log of logs) {
          // EventLog has args, Log does not - check interface
          if ('args' in log && log.args) {
            const borrower = (log.args as any)?.borrower as string;
            if (borrower) {
              seen.add(borrower.toLowerCase());
            }
          }
        }
        
        if (logs.length > 0) {
          console.log(`[ChainSweep] ${k}: found ${logs.length} Borrow events in blocks ${start}-${end}`);
        }
      } catch (err: any) {
        // Ignore bad markets or ABI mismatches
        if (process.env.DEBUG_CANDIDATES === "1") {
          console.error(`[ChainSweep] Failed to scan ${k} blocks ${start}-${end}:`, err.message);
        }
      }
    }
  }
  
  const borrowers = [...seen];
  console.log(`[ChainSweep] Total unique borrowers found: ${borrowers.length}`);
  
  return borrowers;
}
