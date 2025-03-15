import { z } from "zod";
import { TransactionSignature, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { connection } from "../services/connection";
import { classifyTransaction, identifyProtocol } from "../services/transaction";
import { formatTransactionDetails } from "../formatters/formatTransaction";
import { TransactionDetails } from "../types/interfaces";

export const getTransactionDetailsTool = {
    name: "getTransactionDetails",
    description: "Gets detailed information about a specific Solana transaction by signature",
    parameters: {
        signature: z.string(),
    },
    execute: async ({ signature }: { signature: string }) => {
        try {
            const tx = await connection.getParsedTransaction(signature as TransactionSignature, {
                maxSupportedTransactionVersion: 0,
            });

            if (!tx) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                error: "Transaction not found",
                            }),
                        },
                    ],
                };
            }

            const details: TransactionDetails = {
                signature,
                blockTime: (tx.blockTime || 0) * 1000,
                fee: (tx.meta?.fee || 0) / LAMPORTS_PER_SOL,
                status: tx.meta?.err === null ? "Success" : "Failed",
                type: classifyTransaction(tx),
                accounts: tx.transaction.message.accountKeys.map((key) => key.pubkey.toString()),
                programIds: tx.transaction.message.instructions
                    .map((ix) => {
                        if ("programId" in ix) {
                            return ix.programId.toString();
                        }
                        return null;
                    })
                    .filter(Boolean)
                    .map((id) => ({
                        id: id as string,
                        name: identifyProtocol(id as string),
                    })),
            };

            const formattedDetails = formatTransactionDetails(details);

            return {
                content: [
                    { type: "text", text: formattedDetails },
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: true,
                            details,
                        }),
                    },
                ],
            };
        } catch (error) {
            console.error("Error in getTransactionDetails:", error);
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
                isError: true,
            };
        }
    },
}; 