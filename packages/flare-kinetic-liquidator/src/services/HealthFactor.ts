import { BigNumber } from "ethers";
const ONE = BigNumber.from("1000000000000000000");
export function healthFactor(totalCollateralUsd18: BigNumber, totalBorrowUsd18: BigNumber): number {
  if (totalBorrowUsd18.isZero()) return 999;
  // HF = collateral / borrow
  return Number(totalCollateralUsd18.mul(ONE).div(totalBorrowUsd18)) / 1e18;
}


