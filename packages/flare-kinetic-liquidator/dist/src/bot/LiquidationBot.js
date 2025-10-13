"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LiquidationBot = void 0;
const ethers_1 = require("ethers");
const ComptrollerAdapter_1 = require("../adapters/ComptrollerAdapter");
const PriceServiceCompound_1 = require("../services/PriceServiceCompound");
const SubgraphCandidates_1 = require("../sources/SubgraphCandidates");
const OnChainValidator_1 = require("./OnChainValidator");
class LiquidationBot {
    constructor(config) {
        this.config = config;
        this.provider = new ethers_1.JsonRpcProvider(config.rpcUrl);
        this.comptroller = new ComptrollerAdapter_1.ComptrollerAdapter(this.provider, config.comptroller);
        this.subgraph = new SubgraphCandidates_1.SubgraphCandidates(config.subgraphUrl);
        if (config.privateKey) {
            this.wallet = new ethers_1.Wallet(config.privateKey, this.provider);
        }
    }
    async init() {
        const params = await this.comptroller.getParams();
        console.log("Comptroller params:", params);
        this.priceService = new PriceServiceCompound_1.PriceServiceCompound(this.provider, params.oracle);
        this.validator = new OnChainValidator_1.OnChainValidator(this.provider, this.comptroller, this.priceService);
        console.log(`Bot initialized. Simulate: ${this.config.simulate}`);
    }
    async run() {
        await this.init();
        while (true) {
            try {
                await this.checkAndLiquidate();
            }
            catch (err) {
                console.error("Bot error:", err.message);
            }
            console.log(`Sleeping ${this.config.checkInterval}ms...`);
            await new Promise(r => setTimeout(r, this.config.checkInterval));
        }
    }
    async checkAndLiquidate() {
        console.log("Fetching candidates from subgraph...");
        const candidates = await this.subgraph.fetch();
        console.log(`Found ${candidates.length} candidates`);
        if (!this.validator)
            return;
        let liquidated = 0;
        for (const c of candidates) {
            if (liquidated >= this.config.maxLiquidations)
                break;
            const validated = await this.validator.validate(c, this.config.minHealthFactor);
            if (!validated)
                continue;
            console.log(`Liquidatable: ${validated.address} HF=${validated.healthFactor.toFixed(3)}`);
            if (this.config.simulate) {
                console.log("  [SIMULATE] Would liquidate but simulate=true");
                continue;
            }
            if (!this.wallet) {
                console.log("  [SKIP] No private key configured");
                continue;
            }
            // TODO: choose best debt/collateral pair and calculate profitability
            console.log("  [SKIP] Profitability logic not yet implemented");
            liquidated++;
        }
    }
}
exports.LiquidationBot = LiquidationBot;
