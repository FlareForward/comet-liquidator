import { ethers } from "hardhat";

async function main() {
  const exec  = process.env.FLASH_EXECUTOR_V3!;
  const token = process.env.RESCUE_TOKEN!;
  const to    = process.env.RESCUE_TO!;
  const amt   = ethers.BigNumber.from(process.env.RESCUE_AMOUNT!);
  if (!exec || !token || !to) throw new Error("set FLASH_EXECUTOR_V3, RESCUE_TOKEN, RESCUE_TO, RESCUE_AMOUNT");
  const C = await ethers.getContractAt("FlashLiquidatorV3", exec);
  const tx = await C.rescueTokens(token, to, amt);
  console.log("tx:", tx.hash);
  await tx.wait();
  console.log("rescued");
}
main().catch(e=>{console.error(e);process.exit(1);});
