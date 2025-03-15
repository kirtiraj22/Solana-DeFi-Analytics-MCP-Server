import { WalletActivity, WalletProfile, Strategy } from "../types/interfaces";
import { identifyProtocol } from "../services/transaction";

export function recommendStrategies(
    activities: WalletActivity[],
    profile?: WalletProfile
): Strategy[] {
    if (!activities.length) {
        return [{
            strategy: "Start DeFi",
            description: "Begin with small positions in established protocols.",
            riskLevel: "low",
            potentialReturn: "3-5% APY"
        }];
    }

    const recommendations: Strategy[] = [];
    const riskProfile = profile?.riskProfile || "moderate";
    const usedProtocols = new Set<string>();
    
    activities.forEach((a) => {
        if (a.programId && a.programId !== "Unknown") {
            usedProtocols.add(identifyProtocol(a.programId));
        }
    });

    if (riskProfile === "conservative") {
        recommendations.push({
            strategy: "Staking SOL",
            description: "Stake SOL with a validator for steady returns.",
            riskLevel: "low",
            potentialReturn: "5-7% APY"
        });

        if (!usedProtocols.has("MARINADE_STAKING")) {
            recommendations.push({
                strategy: "Liquid Staking",
                description: "Use Marinade Finance for liquid staking to earn staking rewards while maintaining liquidity.",
                riskLevel: "low",
                potentialReturn: "6-8% APY"
            });
        }
    } else if (riskProfile === "moderate") {
        if (!usedProtocols.has("SOLEND")) {
            recommendations.push({
                strategy: "Supply Stablecoins",
                description: "Supply USDC or USDT to Solend to earn lending interest.",
                riskLevel: "medium",
                potentialReturn: "8-12% APY"
            });
        }

        recommendations.push({
            strategy: "Diversified LP",
            description: "Provide liquidity to stable pairs on Raydium or Orca.",
            riskLevel: "medium",
            potentialReturn: "10-20% APY"
        });
    } else {
        recommendations.push({
            strategy: "Leveraged Farming",
            description: "Use leverage on Solend or Mango Markets for amplified yields.",
            riskLevel: "high",
            potentialReturn: "20-40% APY with risk"
        });

        if (!usedProtocols.has("MANGO_MARKETS")) {
            recommendations.push({
                strategy: "Perpetual Trading",
                description: "Trade perpetual futures on Mango Markets or Drift Protocol.",
                riskLevel: "high",
                potentialReturn: "Variable"
            });
        }
    }

    return recommendations;
} 