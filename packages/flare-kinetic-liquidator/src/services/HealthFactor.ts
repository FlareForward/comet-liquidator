const ONE = 1000000000000000000n;
export function healthFactor(totalCollateralUsd18: bigint, totalBorrowUsd18: bigint): number {
  if (totalBorrowUsd18 === 0n) return 999;
  // HF = collateral / borrow
  return Number((totalCollateralUsd18 * ONE) / totalBorrowUsd18) / 1e18;
}


