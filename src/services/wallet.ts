import { PublicKey, TransactionSignature } from "@solana/web3.js";
import { connection, delay } from "./connection";
import { walletCache } from "../utils/cache";
import { WalletActivity, WalletProfile, DeFiPosition } from "../types/interfaces";
import { classifyTransaction, estimateTransactionValue, identifyProtocol } from "./transaction";

export async function fetchWalletTransactions(
    publicKey: string,
    limit: number = 20
): Promise<WalletActivity[]> {
    try {
        const cachedData = walletCache.get(publicKey);
        if (cachedData && !walletCache.isStale(publicKey)) {
            return cachedData.activities.slice(0, limit);
        }

        const signatures = await connection.getSignaturesForAddress(
            new PublicKey(publicKey),
            { limit }
        );

        const activities: WalletActivity[] = [];
        const batchSize = 5;

        for (let i = 0; i < signatures.length; i += batchSize) {
            const batch = signatures.slice(i, i + batchSize);
            const promises = batch.map((sig) =>
                connection.getParsedTransaction(sig.signature, {
                    maxSupportedTransactionVersion: 0,
                })
            );

            const transactions = await Promise.all(promises);

            for (let j = 0; j < transactions.length; j++) {
                const tx = transactions[j];
                const sig = batch[j];

                if (!tx) continue;

                const timestamp = sig.blockTime ? sig.blockTime * 1000 : Date.now();
                const type = classifyTransaction(tx);
                const value = estimateTransactionValue(tx);
                const success = tx.meta?.err === null;

                let programId = "Unknown";
                if (tx.transaction.message.instructions.length > 0) {
                    const firstIx = tx.transaction.message.instructions[0];
                    if ("programId" in firstIx) {
                        programId = firstIx.programId.toString();
                    }
                }

                activities.push({
                    timestamp,
                    signature: sig.signature,
                    type,
                    description: `${type} transaction`,
                    value,
                    programId,
                    success,
                });
            }

            if (i + batchSize < signatures.length) {
                await delay(200);
            }
        }

        walletCache.set(publicKey, {
            lastUpdated: Date.now(),
            activities,
        });

        return activities;
    } catch (error) {
        console.error("Error fetching wallet transactions:", error);
        return [];
    }
}

export async function generateWalletProfile(
    publicKey: string,
    activities: WalletActivity[]
): Promise<WalletProfile> {
    const cachedData = walletCache.get(publicKey);
    if (cachedData?.profile) {
        return cachedData.profile;
    }

    if (activities.length === 0) {
        return {
            address: publicKey,
            activityCount: 0,
            firstActivityDate: 0,
            lastActivityDate: 0,
            favoriteProtocols: [],
            transactionVolume: 0,
            riskProfile: "conservative",
            portfolioDiversification: 0,
        };
    }

    const timestamps = activities.map((a) => a.timestamp).filter((t) => t > 0);
    const firstActivityDate = timestamps.length > 0 ? Math.min(...timestamps) : 0;
    const lastActivityDate = timestamps.length > 0 ? Math.max(...timestamps) : 0;

    const protocolCounts = new Map<string, number>();
    activities.forEach((a) => {
        const protocol = identifyProtocol(a.programId);
        protocolCounts.set(protocol, (protocolCounts.get(protocol) || 0) + 1);
    });

    const favoriteProtocols = Array.from(protocolCounts.entries())
        .filter(([name]) => name !== "Unknown")
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

    const transactionVolume = activities
        .filter((a) => a.value !== undefined)
        .reduce((sum, a) => sum + (a.value || 0), 0);

    let riskProfile: "conservative" | "moderate" | "aggressive" = "moderate";
    const swapCount = activities.filter((a) => a.type === "Swap").length;
    const tradingCount = activities.filter((a) => a.type === "Trading").length;
    const lendingCount = activities.filter((a) => a.type === "Lending").length;

    if (tradingCount > 5 || activities.some((a) => identifyProtocol(a.programId) === "MANGO_MARKETS")) {
        riskProfile = "aggressive";
    } else if (swapCount > 10 || lendingCount > 0) {
        riskProfile = "moderate";
    } else {
        riskProfile = "conservative";
    }

    const uniqueProtocols = new Set(activities.map((a) => identifyProtocol(a.programId))).size;
    const diversification = Math.min(100, uniqueProtocols * 10);

    const profile = {
        address: publicKey,
        activityCount: activities.length,
        firstActivityDate,
        lastActivityDate,
        favoriteProtocols,
        transactionVolume,
        riskProfile,
        portfolioDiversification: diversification,
    };

    const existingCache = walletCache.get(publicKey);
    if (existingCache) {
        walletCache.set(publicKey, {
            ...existingCache,
            profile,
        });
    }

    return profile;
} 