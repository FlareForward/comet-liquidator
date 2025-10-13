"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComptrollerAdapter = void 0;
const ethers_1 = require("ethers");
const comptroller_json_1 = __importDefault(require("../abi/comptroller.json"));
const MANTISSA = 1e18;
class ComptrollerAdapter {
    constructor(provider, comptroller) {
        this.provider = provider;
        this.comptroller = comptroller;
        this.contract = new ethers_1.Contract(this.comptroller, comptroller_json_1.default, this.provider);
    }
    async getParams() {
        const [closeFactorMantissa, liqIncentiveMantissa] = await Promise.all([
            this.contract.closeFactorMantissa(),
            this.contract.liquidationIncentiveMantissa()
        ]);
        return {
            closeFactor: Number(closeFactorMantissa) / MANTISSA,
            liqIncentive: Number(liqIncentiveMantissa) / MANTISSA,
            oracle: await this.contract.oracle()
        };
    }
    async getAllMarkets() {
        return this.contract.getAllMarkets();
    }
    async marketInfo(kToken) {
        const m = await this.contract.markets(kToken);
        return { isListed: m.isListed, collateralFactor: Number(m.collateralFactorMantissa) / MANTISSA };
    }
}
exports.ComptrollerAdapter = ComptrollerAdapter;
