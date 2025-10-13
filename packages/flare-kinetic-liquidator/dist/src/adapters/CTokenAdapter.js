"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CTokenAdapter = void 0;
const ethers_1 = require("ethers");
const ctoken_json_1 = __importDefault(require("../abi/ctoken.json"));
const erc20_json_1 = __importDefault(require("../abi/erc20.json"));
class CTokenAdapter {
    constructor(provider, kToken) {
        this.provider = provider;
        this.kToken = kToken;
        this.c = new ethers_1.Contract(kToken, ctoken_json_1.default, provider);
    }
    async underlying() {
        const u = await this.c.underlying();
        const e = new ethers_1.Contract(u, erc20_json_1.default, this.provider);
        const d = await e.decimals();
        return { addr: u, decimals: Number(d) };
    }
    borrowBalanceStored(a) { return this.c.borrowBalanceStored(a); }
    exchangeRateStored() { return this.c.exchangeRateStored(); }
}
exports.CTokenAdapter = CTokenAdapter;
