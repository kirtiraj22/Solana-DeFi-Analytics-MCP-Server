import { WalletProfile, TransactionPattern, DeFiPosition, Strategy, WalletActivity } from "../types/interfaces";
import { RISK_EMOJI } from "../config/constants";

export function formatWalletAnalysis(
    profile: WalletProfile,
    patterns: TransactionPattern[],
    positions: DeFiPosition[],
    recommendations: Strategy[],
    recentActivities: WalletActivity[]
): string {
    const activityTypeCount = recentActivities.reduce((acc, activity) => {
        acc[activity.type] = (acc[activity.type] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return `
        # Wallet Analysis Report ${RISK_EMOJI[profile.riskProfile]}

        **Wallet Address:** \`${profile.address}\`
        **Risk Profile:** ${profile.riskProfile.toUpperCase()}
        **Portfolio Diversification Score:** ${profile.portfolioDiversification}/100

        ## Activity Overview
        **Total Transactions:** ${profile.activityCount}
        **First Activity:** ${new Date(profile.firstActivityDate).toISOString()}
        **Last Activity:** ${new Date(profile.lastActivityDate).toISOString()}
        **Transaction Volume:** ${profile.transactionVolume.toFixed(2)} SOL

        ### Favorite Protocols
        ${profile.favoriteProtocols
            .map((p) => `- ${p.name}: ${p.count} interactions`)
            .join("\n")}

        ### Recent Activity Distribution
        ${Object.entries(activityTypeCount)
            .map(([type, count]) => `- ${type}: ${count} transactions`)
            .join("\n")}

        ## Behavioral Patterns
        ${patterns
            .map(
                (pattern) => `
        ### ${pattern.patternType} (${(pattern.confidence * 100).toFixed(1)}% confidence)
        ${pattern.description}`
            )
            .join("\n")}

        ## Active DeFi Positions
        ${positions.length === 0
            ? "No active DeFi positions detected."
            : positions
                .map(
                    (pos) => `
        ### ${pos.protocol} - ${pos.type}
        - Token: ${pos.tokenA || "Multiple"}
        - Value: ${pos.value ? pos.value.toFixed(2) + " SOL" : "Unknown"}
        - APY: ${pos.apy ? pos.apy.toFixed(2) + "%" : "N/A"}
        - Last Updated: ${new Date(pos.timestamp).toISOString()}`
                )
                .join("\n")}

        ## Strategy Recommendations
        ${recommendations
            .map(
                (rec) => `
        ### ${rec.strategy} (${rec.riskLevel.toUpperCase()} RISK)
        - ${rec.description}
        - Expected Return: ${rec.potentialReturn}`
            )
            .join("\n")}

        ## Risk Assessment
        - Portfolio Concentration: ${
                profile.portfolioDiversification < 30
                    ? "⚠️ HIGH"
                    : profile.portfolioDiversification < 60
                    ? "⚡ MEDIUM"
                    : "✅ LOW"
            }
        - Trading Frequency: ${
                profile.activityCount > 100
                    ? "🔄 HIGH"
                    : profile.activityCount > 50
                    ? "⚡ MEDIUM"
                    : "🐢 LOW"
            }
        - Protocol Diversity: ${profile.favoriteProtocols.length} different protocols used

        ## Safety Tips
        - Always verify transaction details before signing
        - Consider using hardware wallet for large holdings
        - Maintain a diversified portfolio across different protocols
        - Monitor position health regularly
        ${profile.riskProfile === "aggressive"
            ? "- Consider setting stop-loss orders for trading positions"
            : ""}
        ${profile.portfolioDiversification < 30
            ? "- Consider diversifying across more protocols to reduce risk"
            : ""}

        *This analysis is based on on-chain activity and is provided for informational purposes only.*
`;
} 