"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OnChainValidator = void 0;
const CTokenAdapter_1 = require("../adapters/CTokenAdapter");
const HealthFactor_1 = require("../services/HealthFactor");
class OnChainValidator {
    constructor(provider, comptroller, priceService) {
        this.provider = provider;
        this.comptroller = comptroller;
        this.priceService = priceService;
    }
    async validate(candidate, minHealthFactor) {
        try {
            const markets = await this.comptroller.getAllMarkets();
            const params = await this.comptroller.getParams();
            let totalCollateralUsd = 0n;
            let totalBorrowUsd = 0n;
            const marketData = [];
            for (const kToken of markets) {
                const adapter = new CTokenAdapter_1.CTokenAdapter(this.provider, kToken);
                const borrow = await adapter.borrowBalanceStored(candidate.address);
                const info = await this.comptroller.marketInfo(kToken);
                if (!info.isListed)
                    continue;
                const price = await this.priceService.priceOf(kToken);
                const priceBigInt = BigInt(price);
                // Accumulate borrow in 18-dec USD
                const borrowUsd = (borrow * priceBigInt) / 1000000000000000000n;
                totalBorrowUsd += borrowUsd;
                // TODO: get actual collateral balance (requires reading cToken balance + exchangeRate)
                // For now, skip collateral accumulation
                if (borrow > 0n) {
                    marketData.push({
                        kToken,
                        underlying: (await adapter.underlying()).addr,
                        borrowBalance: borrow,
                        collateralBalance: 0n,
                        price
                    });
                }
            }
            if (totalBorrowUsd === 0n)
                return null;
            const hf = (0, HealthFactor_1.healthFactor)(totalCollateralUsd, totalBorrowUsd);
            if (hf >= minHealthFactor)
                return null;
            return {
                ...candidate,
                healthFactor: hf,
                markets: marketData
            };
        }
        catch (err) {
            console.error(`Failed to validate ${candidate.address}:`, err.message);
            return null;
        }
    }
}
exports.OnChainValidator = OnChainValidator;
