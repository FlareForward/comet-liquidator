import "dotenv/config";
import { ethers } from "hardhat";

function req(n: string, v?: string) { 
  if (!v) throw new Error(`Missing env: ${n}`); 
  return v; 
}

async function main() {
  const factory = req("V3_FACTORY", process.env.V3_FACTORY);
  const router  = req("DEX_ROUTER", process.env.DEX_ROUTER);
  const sink    = req("PAYOUT_TOKEN_BENEFICIARY", process.env.PAYOUT_TOKEN_BENEFICIARY);

  console.log("factory:", factory);
  console.log("router :", router);
  console.log("sink   :", sink);

  // Get signer from Hardhat
  const [deployer] = await ethers.getSigners();
  console.log("deployer:", deployer.address);

  const C = await ethers.getContractFactory("FlashLiquidatorV3", deployer);
  const c = await C.deploy(factory, router, sink);
  await c.waitForDeployment();
  const address = await c.getAddress();
  console.log("\nFLASH_EXECUTOR_V3=", address);
}

main().catch((e)=>{ console.error(e); process.exit(1);});


