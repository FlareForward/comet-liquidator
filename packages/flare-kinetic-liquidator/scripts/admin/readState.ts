import hre from "hardhat";
const { ethers } = hre;

async function main() {
  const exec = process.env.FLASH_EXECUTOR_V3!;
  if (!exec) throw new Error("set FLASH_EXECUTOR_V3");
  const C = await ethers.getContractAt("FlashLiquidatorV3", exec);
  console.log("executor:", exec);
  console.log("owner:", await C.owner());
  console.log("paused:", await C.paused());
  try { console.log("beneficiary:", await (C as any).beneficiary()); } catch { console.log("beneficiary: <immutable>"); }
}
main().catch(e=>{console.error(e);process.exit(1);});
