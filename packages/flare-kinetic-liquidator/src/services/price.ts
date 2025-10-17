import { Contract, Provider } from "ethers";

// Standard Compound oracle ABI
const ORACLE_ABI = [
  "function getUnderlyingPrice(address cToken) view returns (uint256)"
];

// Minimal ABIs used for traversal
const CTOKEN_MIN_ABI = [
  "function comptroller() view returns (address)",
  "function borrowBalanceStored(address) view returns (uint256)",
  "function underlying() view returns (address)"
];

const COMPTROLLER_MIN_ABI = [
  "function oracle() view returns (address)"
];

const ONE_E36 = 10n ** 36n;

export type U256 = bigint;

export function asU256(x: unknown): U256 {
  return BigInt(x as string);
}

export async function oracleForCToken(cToken: string, provider: Provider): Promise<Contract> {
  const ct = new Contract(cToken, CTOKEN_MIN_ABI, provider);
  const compAddr: string = await ct.comptroller();
  const comptroller = new Contract(compAddr, COMPTROLLER_MIN_ABI, provider);
  const oracleAddr: string = await comptroller.oracle();
  return new Contract(oracleAddr, ORACLE_ABI, provider);
}

export async function priceMantissa(cToken: string, provider: Provider): Promise<U256> {
  const oracle = await oracleForCToken(cToken, provider);
  const p: U256 = asU256(await oracle.getUnderlyingPrice(cToken));
  if (p === 0n) throw new Error(`price=0 for ${cToken}`);
  return p;
}

// Returns 18-decimal USD
export async function borrowUsd18(user: string, cToken: string, provider: Provider): Promise<bigint> {
  const ct = new Contract(cToken, CTOKEN_MIN_ABI, provider);
  const [p, borrow] = await Promise.all([
    priceMantissa(cToken, provider),
    ct.borrowBalanceStored(user)
  ]);
  return (BigInt(borrow) * BigInt(p)) / ONE_E36;
}

// Variant when oracle address is already known for the user's scope
export async function borrowUsd18WithOracle(user: string, cToken: string, provider: Provider, oracleAddr: string): Promise<U256> {
  const ct = new Contract(cToken, CTOKEN_MIN_ABI, provider);
  const oracle = new Contract(oracleAddr, ORACLE_ABI, provider);
  // Loud log for oracle used per price read
  console.log(`[PriceService] oracle=${oracleAddr} cToken=${cToken}`);
  const [p, borrow] = await Promise.all([
    oracle.getUnderlyingPrice(cToken),
    ct.borrowBalanceStored(user)
  ]);
  return (asU256(borrow) * asU256(p)) / ONE_E36;
}


