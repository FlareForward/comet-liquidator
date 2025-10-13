"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.execFlash = execFlash;
const ethers_1 = require("ethers");
const Univ3Discovery_1 = require("../dex/Univ3Discovery");
const univ3pool_json_1 = __importDefault(require("../abi/univ3pool.json"));
const FlashLiquidatorV3_json_1 = __importDefault(require("../../artifacts/contracts/FlashLiquidatorV3.sol/FlashLiquidatorV3.json"));
async function execFlash(w, factory, flashExecutor, borrower, kTokenDebt, debtToken, kTokenColl, collUnderlying, flashToken, repayAmount, minProfitFlashUnits, minOutDebtSwap, minOutCollSwap, fees) {
    const prov = w.provider;
    const found = await (0, Univ3Discovery_1.findPool)(prov, factory, flashToken, flashToken, fees);
    if (!found)
        throw new Error("pool-not-found");
    const pool = new ethers_1.Contract(found.pool, univ3pool_json_1.default, prov);
    const exec = new ethers_1.Contract(flashExecutor, FlashLiquidatorV3_json_1.default.abi, w);
    const params = {
        borrower, kTokenDebt, debtToken, kTokenColl, collUnderlying, flashToken,
        repayAmount, fee: found.fee, minProfit: minProfitFlashUnits,
        minOutDebtSwap, minOutCollSwap
    };
    const tx = await exec.liquidateWithFlash(pool.address, params, { gasLimit: 6000000 });
    return tx.wait();
}
