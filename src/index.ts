import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	Connection,
	LAMPORTS_PER_SOL,
	PublicKey,
	clusterApiUrl,
	ParsedTransactionWithMeta,
	ParsedInstruction,
	PartiallyDecodedInstruction,
	TransactionSignature,
} from "@solana/web3.js";
import { z } from "zod";
import "dotenv/config";

// Initialize MCP Server
const server = new McpServer({
	name: "Solana DeFi Analytics MCP Server",
	version: "1.0.0",
});

// Connection Setup
const RPC_URL = process.env.SOLANA_RPC_URL || clusterApiUrl("mainnet-beta");
// console.log("Using RPC URL:", RPC_URL);

const connection = new Connection(RPC_URL, {
	commitment: "confirmed",
	disableRetryOnRateLimit: false,
	confirmTransactionInitialTimeout: 60000,
});

// Well-known program IDs for protocol identification
const KNOWN_PROGRAMS = {
	RAYDIUM_SWAP: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
	ORCA_SWAP: "9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP",
	JUPITER_AGGREGATOR: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
	MARINADE_STAKING: "MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD",
	SERUM_DEX_V3: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
	SOLEND: "So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo",
	MANGO_MARKETS: "mv3ekLzLbnVPNxjSKvqBpU3ZeZXPQdEC3bp5MDEBG68",
	// Token programs
	TOKEN_PROGRAM: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
	ASSOCIATED_TOKEN_PROGRAM: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
	METAPLEX: "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
    FLUXBEAM: "FLUXubRmkEi2q6K3Y9kBPg9248ggaZVsoSFhtJHSrm1X" 
};

// Type definitions
interface WalletActivity {
	timestamp: number;
	signature: string;
	type: string;
	description: string;
	value?: number;
	token?: string;
	programId: string;
	success: boolean;
}

interface TokenHolding {
	mint: string;
	symbol: string;
	amount: number;
	decimals: number;
	usdValue?: number;
}

interface DeFiPosition {
	protocol: string;
	type: string;
	tokenA?: string;
	tokenB?: string;
	value?: number;
	apy?: number;
	timestamp: number;
}

interface WalletProfile {
	address: string;
	activityCount: number;
	firstActivityDate: number;
	lastActivityDate: number;
	favoriteProtocols: { name: string; count: number }[];
	transactionVolume: number;
	riskProfile: "conservative" | "moderate" | "aggressive";
	portfolioDiversification: number;
}

// In-memory cache for wallet data
const walletCache = new Map<
	string,
	{
		lastUpdated: number;
		activities: WalletActivity[];
		profile?: WalletProfile;
		defiPositions?: DeFiPosition[];
	}
>();

// Utility functions
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));



// Extract transaction value estimation (simplified)
function estimateTransactionValue(
	tx: ParsedTransactionWithMeta
): number | undefined {
	if (!tx.meta) return undefined;

	// For SOL transfers, we can look at pre/post balances
	const preBalances = tx.meta.preBalances;
	const postBalances = tx.meta.postBalances;

	if (preBalances && postBalances && preBalances.length > 0) {
		const feePayer =
			tx.transaction.message.accountKeys[0].pubkey.toString();
		const feePayerIndex = tx.transaction.message.accountKeys.findIndex(
			(key) => key.pubkey.toString() === feePayer
		);

		if (feePayerIndex >= 0) {
			const balanceDiff = Math.abs(
				preBalances[feePayerIndex] - postBalances[feePayerIndex]
			);
			return balanceDiff / LAMPORTS_PER_SOL;
		}
	}

	return undefined;
}


// Fetch historical transaction data for a wallet
async function fetchWalletTransactions(
	publicKey: string,
	limit: number = 20
): Promise<WalletActivity[]> {
	try {
		// Check cache first
		const cachedData = walletCache.get(publicKey);
		console.log("Cached Data(384) : ", JSON.stringify(cachedData));
		if (cachedData && Date.now() - cachedData.lastUpdated < 5 * 60 * 1000) {
			// 5 min cache
			return cachedData.activities.slice(0, limit);
		}

		// Fetch transactions
		const signatures = await connection.getSignaturesForAddress(
			new PublicKey(publicKey),
			{ limit }
		);

		// Batch transactions for efficiency
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

				// Extract important transaction data
				const timestamp = sig.blockTime
					? sig.blockTime * 1000
					: Date.now();
				const type = classifyTransaction(tx);
				const value = estimateTransactionValue(tx);
				const success = tx.meta?.err === null;

				// Get primary program ID from first instruction
				let programId = "Unknown";
				if (tx.transaction.message.instructions.length > 0) {
					const firstIx = tx.transaction.message.instructions[0];
					if ("programId" in firstIx) {
						programId = (
							firstIx as PartiallyDecodedInstruction
						).programId.toString();
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

			// Avoid rate limiting
			if (i + batchSize < signatures.length) {
				await delay(200);
			}
		}

		// Store in cache
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


server.tool(
	"analyzeWallet",
	"Analyzes a Solana wallet's DeFi activity and creates a profile with recommendations",
	{
		address: z.string(),
	},
	async ({ address }) => {
		try {
			// Validate address
			const pubkey = new PublicKey(address);
			const walletAddress = pubkey.toString();


			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({
							success: true,
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
							error:
								error instanceof Error
									? error.message
									: "Unknown error",
						}),
					},
				],
			};
		}
	}
);


async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.log("Solana DeFi Analytics MCP Server started");

	const pubKey = new PublicKey("7AHmjd25gBtH1YmwxL13xx23C69VQr5oLRxbP3pD1Wo1")
	const walletAddress = pubKey.toString()

	const activities = await fetchWalletTransactions(walletAddress, 50);
	console.log("Activity(843) : ", activities);

}

main().catch((err: unknown) => {
	const error = err as Error;
	console.error("Error running MCP server: ", error.message);
	process.exit(1);
});
