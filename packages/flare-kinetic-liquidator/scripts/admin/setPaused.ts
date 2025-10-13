import hre from "hardhat";
const { ethers } = hre;

async function main() {
  const exec = process.env.FLASH_EXECUTOR_V3!;
  const val  = (process.env.PAUSE || "true").toLowerCase() === "true";
  if (!exec) throw new Error("set FLASH_EXECUTOR_V3");
  const C = await ethers.getContractAt("FlashLiquidatorV3", exec);
  const tx = await C.setPaused(val);
  console.log("tx:", tx.hash);
  await tx.wait();
  console.log("paused:", await C.paused());
}
main().catch(e=>{console.error(e);process.exit(1);});
