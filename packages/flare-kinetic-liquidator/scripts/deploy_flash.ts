import { ethers } from "hardhat";

async function main() {
  const factory = process.env.FACTORY_V3!;
  const router  = process.env.ROUTER_V2!;
  const sink    = process.env.BENEFICIARY!;
  const C = await ethers.getContractFactory("FlashLiquidatorV3");
  const c = await C.deploy(factory, router, sink);
  await c.deployed();
  console.log("FLASH_EXECUTOR_V3=", c.address);
}
main().catch((e)=>{ console.error(e); process.exit(1);});


