import { BigNumber, Wallet, Contract } from "ethers";
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
  repayAmount: BigNumber,
  minProfitFlashUnits: BigNumber,
  minOutDebtSwap: BigNumber,
  minOutCollSwap: BigNumber,
  fees: number[]
) {
  const prov = w.provider!;
  const found = await findPool(prov, factory, flashToken, flashToken, fees);
  if (!found) throw new Error("pool-not-found");
  const pool = new Contract(found.pool, PoolAbi, prov);
  const exec = new Contract(flashExecutor, (FlashAbi as any).abi, w);
  const params = {
    borrower, kTokenDebt, debtToken, kTokenColl, collUnderlying, flashToken,
    repayAmount, fee: found.fee, minProfit: minProfitFlashUnits,
    minOutDebtSwap, minOutCollSwap
  };
  const tx = await exec.liquidateWithFlash(pool.address, params, { gasLimit: 6_000_000 });
  return tx.wait();
}


