import "dotenv/config";
import hre from "hardhat";
const { ethers } = hre;

function req(n: string, v?: string) { if (!v) throw new Error(`Missing env: ${n}`); return v; }

async function main() {
  const factory = req("V3_FACTORY", process.env.V3_FACTORY);
  const router  = req("DEX_ROUTER", process.env.DEX_ROUTER);
  const sink    = req("PAYOUT_TOKEN_BENEFICIARY", process.env.PAYOUT_TOKEN_BENEFICIARY);

  const [deployer] = await ethers.getSigners();
  const C = await ethers.getContractFactory("FlashLiquidatorV3", deployer);
  const c = await C.deploy(factory!, router!, sink!);
  await c.deployed();
  console.log("FLASH_EXECUTOR_V3=", c.address);
}
main().catch(e=>{console.error(e);process.exit(1);});
