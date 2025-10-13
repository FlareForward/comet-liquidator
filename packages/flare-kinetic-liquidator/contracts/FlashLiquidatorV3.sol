// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Minimal Uniswap v3 flash liquidator for Compound-v2 markets on Flare (Kinetic).
 * Assumes SparkDEX/Enosys pools follow Uniswap v3 interfaces.
 * Flow:
 *  1) flash from pool in flashToken
 *  2) swap -> debtToken if needed
 *  3) approve debtToken to kTokenDebt, call liquidateBorrow()
 *  4) redeem seized kTokenCollateral to underlying
 *  5) swap collateralUnderlying -> flashToken
 *  6) repay flash + fee, send profit to beneficiary
 */
interface IUniswapV3Pool {
  function token0() external view returns (address);
  function token1() external view returns (address);
  function fee() external view returns (uint24);
  function flash(address recipient, uint256 amount0, uint256 amount1, bytes calldata data) external;
}

interface IUniswapV3Factory {
  function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address);
}

interface IERC20 {
  function balanceOf(address) external view returns (uint256);
  function transfer(address,uint256) external returns (bool);
  function approve(address,uint256) external returns (bool);
  function decimals() external view returns (uint8);
}

interface ICToken {
  function liquidateBorrow(address borrower, uint256 repayAmount, address cTokenCollateral) external returns (uint256);
  function redeemUnderlying(uint256 redeemAmount) external returns (uint256);
  function redeem(uint256) external returns (uint256);
  function balanceOf(address) external view returns (uint256);
  function exchangeRateStored() external view returns (uint256);
  function underlying() external view returns (address);
}

interface IRouterV2 {
  function swapExactTokensForTokens(
    uint amountIn,
    uint amountOutMin,
    address[] calldata path,
    address to,
    uint deadline
  ) external returns (uint[] memory amounts);
}

contract FlashLiquidatorV3 {
  address public immutable factoryV3;
  address public immutable router;
  address public beneficiary; // profit sink in PAYOUT_TOKEN

  error NoPool();
  error FlashFail();
  error SwapFail();

  constructor(address _factoryV3, address _router, address _beneficiary) {
    factoryV3 = _factoryV3;
    router = _router;
    beneficiary = _beneficiary;
  }

  struct Params {
    address borrower;
    address kTokenDebt;
    address debtToken;
    address kTokenColl;
    address collUnderlying;
    address flashToken;
    uint256 repayAmount;          // in debtToken units
    uint24 fee;                   // v3 fee tier
    uint256 minProfit;            // in flashToken units
    uint256 minOutDebtSwap;       // guard
    uint256 minOutCollSwap;       // guard
  }

  // Entry: choose pool by token ordering
  function liquidateWithFlash(address pool, Params calldata p) external {
    require(pool != address(0), "pool=0");
    IUniswapV3Pool(pool).flash(address(this),
      p.flashToken == IUniswapV3Pool(pool).token0() ? p.repayAmount : 0,
      p.flashToken == IUniswapV3Pool(pool).token1() ? p.repayAmount : 0,
      abi.encode(p)
    );
  }

  // Callback per Uniswap v3 spec
  function uniswapV3FlashCallback(uint256 fee0, uint256 fee1, bytes calldata data) external {
    Params memory p = abi.decode(data, (Params));
    // 1) Swap flash -> debt if needed
    if (p.flashToken != p.debtToken) {
      IERC20(p.flashToken).approve(router, type(uint256).max);
      address[] memory path = new address[](2);
      path[0] = p.flashToken; path[1] = p.debtToken;
      IRouterV2(router).swapExactTokensForTokens(
        p.repayAmount, p.minOutDebtSwap, path, address(this), block.timestamp
      );
    }
    // 2) Liquidate
    IERC20(p.debtToken).approve(p.kTokenDebt, type(uint256).max);
    uint256 err = ICToken(p.kTokenDebt).liquidateBorrow(p.borrower, p.repayAmount, p.kTokenColl);
    require(err == 0, "liquidateBorrow failed");

    // 3) Redeem seized collateral
    uint256 cBal = ICToken(p.kTokenColl).balanceOf(address(this));
    require(ICToken(p.kTokenColl).redeem(cBal) == 0, "redeem failed");

    // 4) Swap collateral -> flash
    if (p.collUnderlying != p.flashToken) {
      IERC20(p.collUnderlying).approve(router, type(uint256).max);
      address[] memory path2 = new address[](2);
      path2[0] = p.collUnderlying; path2[1] = p.flashToken;
      IRouterV2(router).swapExactTokensForTokens(
        IERC20(p.collUnderlying).balanceOf(address(this)), p.minOutCollSwap, path2, address(this), block.timestamp
      );
    }

    // 5) Repay flash
    uint256 fee = fee0 + fee1;
    uint256 repay = p.repayAmount + fee;
    require(IERC20(p.flashToken).transfer(msg.sender, repay), "flash repay fail");

    // 6) Profit
    uint256 profit = IERC20(p.flashToken).balanceOf(address(this));
    require(profit >= p.minProfit, "minProfit");
    IERC20(p.flashToken).transfer(beneficiary, profit);
  }
}


