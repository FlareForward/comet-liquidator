"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthFactor = healthFactor;
const ONE = 1000000000000000000n;
function healthFactor(totalCollateralUsd18, totalBorrowUsd18) {
    if (totalBorrowUsd18 === 0n)
        return 999;
    // HF = collateral / borrow
    return Number((totalCollateralUsd18 * ONE) / totalBorrowUsd18) / 1e18;
}
