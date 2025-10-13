"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findPool = findPool;
const ethers_1 = require("ethers");
const univ3factory_json_1 = __importDefault(require("../abi/univ3factory.json"));
async function findPool(provider, factory, a, b, fees) {
    const F = new ethers_1.Contract(factory, univ3factory_json_1.default, provider);
    for (const f of fees) {
        const p = await F.getPool(a, b, f);
        if (p && p !== "0x0000000000000000000000000000000000000000")
            return { pool: p, fee: f };
    }
    return null;
}
