import hre from "hardhat";
import "@nomicfoundation/hardhat-ethers";

async function main() {
  const factory = process.env.FACTORY_V3!;
  const router  = process.env.ROUTER_V2!;
  const sink    = process.env.BENEFICIARY!;
  const C = await hre.ethers.getContractFactory("FlashLiquidatorV3");
  const c = await C.deploy(factory, router, sink);
  await c.waitForDeployment();
  const address = await c.getAddress();
  console.log("FLASH_EXECUTOR_V3=", address);
}
main().catch((e)=>{ console.error(e); process.exit(1);});


