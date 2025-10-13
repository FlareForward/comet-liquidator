import hre from "hardhat";
import "@nomicfoundation/hardhat-ethers";

async function main() {
  const exec = process.env.FLASH_EXECUTOR_V3!;
  const token = process.env.RESCUE_TOKEN!;
  const to = process.env.RESCUE_TO!;
  const amt = process.env.RESCUE_AMOUNT!;
  
  if (!exec || !token || !to || !amt) {
    throw new Error("Set FLASH_EXECUTOR_V3, RESCUE_TOKEN, RESCUE_TO, RESCUE_AMOUNT");
  }
  
  const C = await hre.ethers.getContractAt("FlashLiquidatorV3", exec);
  
  console.log(`Rescuing ${amt} of ${token} to ${to}`);
  const tx = await C.rescueTokens(token, to, amt);
  console.log("tx:", tx.hash);
  
  await tx.wait();
  console.log("Tokens rescued successfully");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

