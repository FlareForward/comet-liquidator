import { Wallet, Contract } from "ethers";
import { findPool } from "../dex/Univ3Discovery";
import PoolAbi from "../abi/univ3pool.json";
import FlashAbi from "../../artifacts/contracts/FlashLiquidatorV3.sol/FlashLiquidatorV3.json";

export async function execFlash(
  w: Wallet,
  factory: string,
  flashExecutor: string,
  borrower: string,
  kTokenDebt: string,
  debtToken: string,
  kTokenColl: string,
  collUnderlying: string,
  flashToken: string,
  repayAmount: bigint,
  minProfitFlashUnits: bigint,
  minOutDebtSwap: bigint,
  minOutCollSwap: bigint,
  fees: number[]
) {
  const prov = w.provider!;
  
  // Find a pool where flashToken is part of the pair
  // Try PRIMARY_FLASH_FALLBACK if configured, otherwise use flashToken itself
  let chosen: { pool: string; fee: number } | null = null;
  for (const f of fees) {
    const primary = process.env.PRIMARY_FLASH_FALLBACK || flashToken;
    const test = await findPool(prov, factory, flashToken, primary, [f]);
    if (test) { 
      chosen = test; 
      break; 
    }
  }
  
  if (!chosen) throw new Error("pool-not-found");
  
  const exec = new Contract(flashExecutor, (FlashAbi as any).abi, w);
  const params = {
    borrower, 
    kTokenDebt, 
    debtToken, 
    kTokenColl, 
    collUnderlying, 
    flashToken,
    repayAmount, 
    fee: chosen.fee, 
    minProfit: minProfitFlashUnits,
    minOutDebtSwap, 
    minOutCollSwap
  };
  const tx = await exec.liquidateWithFlash(chosen.pool, params, { gasLimit: 6_000_000 });
  return tx.wait();
}


