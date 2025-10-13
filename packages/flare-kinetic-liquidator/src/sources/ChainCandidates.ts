import { Contract, Provider } from "ethers";
import cTokenAbi from "../abi/ctoken.json";

export async function chainBorrowerSweep(
  prov: Provider,
  kTokens: string[],
  fromBlock: number,
  toBlock: number,
  initialChunk = Number(process.env.BLOCK_CHUNK || "30")
): Promise<string[]> {
  const seen = new Set<string>();
  let chunk = Math.max(1, initialChunk);

  console.log(`[ChainSweep] Scanning ${kTokens.length} markets from block ${fromBlock} to ${toBlock} (initial chunk=${chunk})`);

  for (let start = fromBlock; start <= toBlock; ) {
    let end = Math.min(start + chunk - 1, toBlock);
    
    try {
      for (const k of kTokens) {
        const c = new Contract(k, cTokenAbi, prov);
        
        // Scan both Borrow and LiquidateBorrow events
        const evBorrow = c.getEvent("Borrow");
        const evLiq = c.getEvent("LiquidateBorrow");
        
        const logsB = await c.queryFilter(evBorrow, start, end);
        const logsL = await c.queryFilter(evLiq, start, end);
        
        // Process Borrow events
        for (const lg of logsB) {
          if ('args' in lg && lg.args) {
            const b = (lg.args as any)?.borrower as string;
            if (b) {
              seen.add(b.toLowerCase());
              if (process.env.DEBUG_CANDIDATES === "1") {
                console.log(`[ChainSweep] Borrow borrower: ${b}`);
              }
            }
          }
        }
        
        // Process LiquidateBorrow events (borrowers who were liquidated may still be underwater)
        for (const lg of logsL) {
          if ('args' in lg && lg.args) {
            const b = (lg.args as any)?.borrower as string;
            if (b) {
              seen.add(b.toLowerCase());
              if (process.env.DEBUG_CANDIDATES === "1") {
                console.log(`[ChainSweep] LiquidateBorrow borrower: ${b}`);
              }
            }
          }
        }
        
        const totalEvents = logsB.length + logsL.length;
        if (totalEvents > 0) {
          console.log(`[ChainSweep] ${k}: found ${logsB.length} Borrow + ${logsL.length} LiquidateBorrow events in blocks ${start}-${end}`);
        }
      }
      
      // Success - advance window
      start = end + 1;
      
      // Gradually recover chunk size if it was reduced
      if (chunk < initialChunk) {
        chunk = Math.min(initialChunk, chunk * 2);
      }
      
    } catch (e: any) {
      const msg = String(e?.message || "");
      
      if (msg.includes("requested too many blocks") || msg.includes("maximum is set to")) {
        // RPC limit hit - shrink chunk size and retry
        const oldChunk = chunk;
        chunk = Math.max(1, Math.floor(chunk / 2));
        
        console.log(`[ChainSweep] RPC block limit hit, reducing chunk from ${oldChunk} to ${chunk}`);
        
        // If chunk is 1 and end > start, force single block
        if (chunk === 1 && end > start) {
          end = start;
        }
        
        // Retry same start with smaller chunk
        continue;
      }
      
      // Non-chunk errors: skip this window and continue
      if (process.env.DEBUG_CANDIDATES === "1") {
        console.error(`[ChainSweep] Error scanning blocks ${start}-${end}:`, msg);
      }
      start = end + 1;
    }
  }
  
  const borrowers = [...seen];
  console.log(`[ChainSweep] Total unique borrowers found: ${borrowers.length}`);
  
  return borrowers;
}
