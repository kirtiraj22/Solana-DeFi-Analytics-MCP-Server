import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
import { fetchWalletTransactions, generateWalletProfile } from "../services/wallet";
import { analyzeTransactionPatterns } from "../analyzers/patternAnalyzer";
import { analyzeDeFiPositions } from "../analyzers/defiAnalyzer";
import { recommendStrategies } from "../analyzers/recommendStrategy";
import { formatWalletAnalysis } from "../formatters/formatWallet";

export const analyzeWalletTool = {
    name: "analyzeWallet",
    description: "Analyzes a Solana wallet's DeFi activity and creates a profile with recommendations",
    parameters: {
        address: z.string(),
    },
    execute: async ({ address }: { address: string }) => {
        try {
            const pubkey = new PublicKey(address);
            const walletAddress = pubkey.toString();

            const activities = await fetchWalletTransactions(walletAddress, 50);
            const profile = await generateWalletProfile(walletAddress, activities);
            const patterns = analyzeTransactionPatterns(activities);
            const positions = await analyzeDeFiPositions(walletAddress);
            const recommendations = recommendStrategies(activities, profile);

            const formattedAnalysis = formatWalletAnalysis(
                profile,
                patterns,
                positions,
                recommendations,
                activities.slice(0, 10)
            );

            return {
                content: [
                    { type: "text", text: formattedAnalysis },
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: true,
                            profile,
                            patterns,
                            positions,
                            recommendations,
                            recentActivities: activities.slice(0, 10),
                        }),
                    },
                ],
            };
        } catch (error) {
            console.error("Error in analyzeWallet:", error);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            error: error instanceof Error ? error.message : "Unknown error",
                        }),
                    },
                ],
            };
        }
    },
}; 