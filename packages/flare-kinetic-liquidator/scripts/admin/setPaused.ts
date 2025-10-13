import hre from "hardhat";
import "@nomicfoundation/hardhat-ethers";

async function main() {
  const exec = process.env.FLASH_EXECUTOR_V3!;
  const val = (process.env.PAUSE || "true").toLowerCase() === "true";
  
  if (!exec) throw new Error("Set FLASH_EXECUTOR_V3 in .env");
  
  const C = await hre.ethers.getContractAt("FlashLiquidatorV3", exec);
  
  console.log(`Setting paused to: ${val}`);
  const tx = await C.setPaused(val);
  console.log("tx:", tx.hash);
  
  await tx.wait();
  console.log("paused:", await C.paused());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

