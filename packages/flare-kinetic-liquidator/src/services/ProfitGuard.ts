import { Provider } from "ethers";
import { quoteOut } from "./Quotes";

/**
 * Converts a profit measured in `flashToken` units to a USD-like token amount
 * using the router path [flashToken -> QUOTE_TOKEN]. Default QUOTE_TOKEN is USDT0.
 */
export async function flashProfitToQuote(
  provider: Provider,
  router: string,
  flashToken: string,
  profitFlash: bigint,
  quoteToken?: string
): Promise<bigint> {
  const qt = quoteToken || process.env.PAYOUT_QUOTE_TOKEN || process.env.USDT0!;
  if (flashToken.toLowerCase() === qt.toLowerCase()) return profitFlash;
  return quoteOut(router, provider, [flashToken, qt], profitFlash);
}

