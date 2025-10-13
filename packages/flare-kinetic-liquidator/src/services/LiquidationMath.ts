/**
 * Liquidation math helpers for computing repay amounts and seized collateral estimates
 */

const ONE = 1000000000000000000n;

// repay = min(borrow, closeFactor * totalBorrow)
export function calcRepayAmount(borrowDebt: bigint, closeFactorMantissa18: bigint): bigint {
  const cap = (borrowDebt * closeFactorMantissa18) / ONE;
  return borrowDebt < cap ? borrowDebt : cap;
}

// seizedUnderlyingEst = repayAmount * liqIncentive / priceRatios * exchange rates
// This is often approximated. If you already compute exact seizeTokens via Comptroller, use that.
export function roughSeizedUnderlying(
  repayAmountDebtUnits: bigint,
  liqIncentiveMantissa18: bigint
): bigint {
  return (repayAmountDebtUnits * liqIncentiveMantissa18) / ONE;
}

