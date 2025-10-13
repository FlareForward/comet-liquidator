import hre from "hardhat";
import "@nomicfoundation/hardhat-ethers";

async function main() {
  const exec = process.env.FLASH_EXECUTOR_V3!;
  const newOwner = process.env.NEW_OWNER!;
  
  if (!exec || !newOwner) {
    throw new Error("Set FLASH_EXECUTOR_V3 and NEW_OWNER");
  }
  
  const C = await hre.ethers.getContractAt("FlashLiquidatorV3", exec);
  
  console.log(`Transferring ownership to: ${newOwner}`);
  const tx = await C.transferOwnership(newOwner);
  console.log("tx:", tx.hash);
  
  await tx.wait();
  console.log("New owner:", await C.owner());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

