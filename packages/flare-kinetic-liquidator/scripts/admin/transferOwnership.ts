import { ethers } from "hardhat";

async function main() {
  const exec = process.env.FLASH_EXECUTOR_V3!;
  const next = process.env.NEW_OWNER!;
  if (!exec || !next) throw new Error("set FLASH_EXECUTOR_V3 and NEW_OWNER");
  const C = await ethers.getContractAt("FlashLiquidatorV3", exec);
  const tx = await C.transferOwnership(next);
  console.log("tx:", tx.hash);
  await tx.wait();
  console.log("owner:", await C.owner());
}
main().catch(e=>{console.error(e);process.exit(1);});
