"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const hardhat_1 = __importDefault(require("hardhat"));
require("@nomicfoundation/hardhat-ethers");
async function main() {
    const factory = process.env.FACTORY_V3;
    const router = process.env.ROUTER_V2;
    const sink = process.env.BENEFICIARY;
    const C = await hardhat_1.default.ethers.getContractFactory("FlashLiquidatorV3");
    const c = await C.deploy(factory, router, sink);
    await c.waitForDeployment();
    const address = await c.getAddress();
    console.log("FLASH_EXECUTOR_V3=", address);
}
main().catch((e) => { console.error(e); process.exit(1); });
