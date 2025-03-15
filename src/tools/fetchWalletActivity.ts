import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
import { fetchWalletTransactions } from "../services/wallet";
import { formatActivityHistory } from "../formatters/formatActivity";

export const fetchWalletActivityTool = {
    name: "fetchWalletActivity",
    description: "Fetches the transaction activity history for a Solana wallet address",
    parameters: {
        address: z.string(),
        limit: z.number().optional().default(20),
    },
    execute: async ({ address, limit }: { address: string; limit: number }) => {
        try {
            const pubkey = new PublicKey(address);
            const walletAddress = pubkey.toString();
            const activities = await fetchWalletTransactions(walletAddress, limit);
            const formattedHistory = formatActivityHistory(activities, walletAddress);

            return {
                content: [
                    { type: "text", text: formattedHistory },
                ],
            };
        } catch (error) {
            console.error("Error in fetchWalletActivity:", error);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            error: error instanceof Error ? error.message : "Unknown error",
                            activities: [],
                        }),
                    },
                ],
            };
        }
    },
}; 