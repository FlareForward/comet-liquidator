"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriceServiceCompound = void 0;
const ethers_1 = require("ethers");
const compoundOracle_json_1 = __importDefault(require("../abi/compoundOracle.json"));
class PriceServiceCompound {
    constructor(provider, oracle) {
        this.provider = provider;
        this.oracle = oracle;
        this.c = new ethers_1.Contract(oracle, compoundOracle_json_1.default, provider);
    }
    // returns 18-dec USD price
    async priceOf(kToken) {
        const p = await this.c.getUnderlyingPrice(kToken);
        return p.toString();
    }
}
exports.PriceServiceCompound = PriceServiceCompound;
