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

const server = new McpServer({
	name: "Solana DeFi Analytics MCP Server",
	version: "1.0.0",
});

const RPC_URL = process.env.SOLANA_RPC_URL || clusterApiUrl("mainnet-beta");
// console.log("Using RPC URL:", RPC_URL);

const connection = new Connection(RPC_URL, {
	commitment: "confirmed",
	disableRetryOnRateLimit: false,
	confirmTransactionInitialTimeout: 60000,
});

const KNOWN_PROGRAMS = {
	RAYDIUM_SWAP: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
	ORCA_SWAP: "9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP",
	JUPITER_AGGREGATOR: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
	MARINADE_STAKING: "MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD",
	SERUM_DEX_V3: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
	SOLEND: "So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo",
	MANGO_MARKETS: "mv3ekLzLbnVPNxjSKvqBpU3ZeZXPQdEC3bp5MDEBG68",
	TOKEN_PROGRAM: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
	ASSOCIATED_TOKEN_PROGRAM: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
	METAPLEX: "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
	FLUXBEAM: "FLUXubRmkEi2q6K3Y9kBPg9248ggaZVsoSFhtJHSrm1X",
};

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

const walletCache = new Map<
	string,
	{
		lastUpdated: number;
		activities: WalletActivity[];
		profile?: WalletProfile;
		defiPositions?: DeFiPosition[];
	}
>();

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function identifyProtocol(programId: string): string {
	for (const [name, id] of Object.entries(KNOWN_PROGRAMS)) {
		if (id === programId) {
			return name;
		}
	}
	return "Unknown";
}

function classifyTransaction(tx: ParsedTransactionWithMeta): string {
	if (
		!tx.transaction.message.instructions ||
		tx.transaction.message.instructions.length === 0
	) {
		return "Unknown";
	}

	const instructions = tx.transaction.message.instructions;

	const instructionSummary = instructions.map((ix) => ({
		program: (ix as ParsedInstruction).program || "",
		type: (ix as ParsedInstruction).parsed?.type || "",
		programId:
			typeof ix === "object" && "programId" in ix
				? ix.programId.toString()
				: "",
	}));

	const hasTokenCreation = instructionSummary.some(
		(ix) =>
			ix.type === "initializeMint" ||
			ix.type === "initializeTokenMetadata"
	);
	if (hasTokenCreation) {
		return "Token Creation";
	}

	const hasNftMint = instructionSummary.some(
		(ix) =>
			ix.programId === KNOWN_PROGRAMS.METAPLEX ||
			(ix.type === "mintTo" && ix.program === "spl-token")
	);
	if (hasNftMint) {
		return "NFT Mint";
	}

	const hasDexOperation = instructionSummary.some(
		(ix) =>
			ix.programId === KNOWN_PROGRAMS.RAYDIUM_SWAP ||
			ix.programId === KNOWN_PROGRAMS.ORCA_SWAP ||
			ix.programId === KNOWN_PROGRAMS.JUPITER_AGGREGATOR ||
			ix.programId === KNOWN_PROGRAMS.SERUM_DEX_V3 ||
			ix.programId === KNOWN_PROGRAMS.FLUXBEAM
	);
	if (hasDexOperation) {
		return "Swap";
	}

	if (
		instructionSummary.some(
			(ix) => ix.programId === KNOWN_PROGRAMS.MARINADE_STAKING
		)
	) {
		return "Staking";
	}

	if (
		instructionSummary.some((ix) => ix.programId === KNOWN_PROGRAMS.SOLEND)
	) {
		return "Lending";
	}

	const hasTokenTransfer = instructionSummary.some(
		(ix) =>
			(ix.program === "spl-token" && ix.type === "transfer") ||
			(ix.program === "system" && ix.type === "transfer")
	);
	if (hasTokenTransfer) {
		return "Transfer";
	}

	const hasAccountCreation = instructionSummary.some(
		(ix) =>
			ix.program === "spl-associated-token-account" ||
			(ix.program === "system" && ix.type === "createAccount")
	);
	if (hasAccountCreation) {
		return "Account Creation";
	}

	const hasAuthorityChange = instructionSummary.some(
		(ix) =>
			ix.type === "setAuthority" ||
			ix.type === "approve" ||
			ix.type === "revoke"
	);
	if (hasAuthorityChange) {
		return "Authority Update";
	}

	return "Other";
}

function estimateTransactionValue(
	tx: ParsedTransactionWithMeta
): number | undefined {
	if (!tx.meta) return undefined;

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

function analyzeTransactionPatterns(activities: WalletActivity[]): {
	patternType: string;
	confidence: number;
	description: string;
}[] {
	if (activities.length < 5) {
		return [
			{
				patternType: "insufficient_data",
				confidence: 0,
				description:
					"Not enough transaction history to establish patterns.",
			},
		];
	}

	const patterns = [];

	const swaps = activities.filter((a) => a.type === "Swap");
	if (swaps.length >= 3) {
		const timeGaps = [];
		for (let i = 1; i < swaps.length; i++) {
			timeGaps.push(swaps[i - 1].timestamp - swaps[i].timestamp);
		}

		const avgGap =
			timeGaps.reduce((sum, gap) => sum + gap, 0) / timeGaps.length;
		const stdDev = Math.sqrt(
			timeGaps.reduce((sum, gap) => sum + Math.pow(gap - avgGap, 2), 0) /
				timeGaps.length
		);

		const isDCA = stdDev / avgGap < 0.3;
		if (isDCA) {
			patterns.push({
				patternType: "dca",
				confidence: 0.7,
				description:
					"Regular token purchases suggest a dollar-cost averaging strategy.",
			});
		}
	}

	const lending = activities.filter((a) => a.type === "Lending");
	if (lending.length > 0) {
		patterns.push({
			patternType: "lending_active",
			confidence: 0.9,
			description:
				"Active lending positions detected. Monitor collateral ratios to avoid liquidation.",
		});
	}

	const stakingActions = activities.filter(
		(a) => a.type === "Staking"
	).length;
	if (stakingActions > 2) {
		patterns.push({
			patternType: "yield_farming",
			confidence: 0.8,
			description:
				"Multiple staking activities suggest active yield farming strategy.",
		});
	}

	return patterns.length > 0
		? patterns
		: [
				{
					patternType: "general",
					confidence: 0.5,
					description:
						"No specific pattern detected in transaction history.",
				},
		  ];
}

function recommendStrategies(
	activities: WalletActivity[],
	profile?: WalletProfile
): {
	strategy: string;
	description: string;
	riskLevel: "low" | "medium" | "high";
	potentialReturn: string;
}[] {
	if (!activities.length) {
		return [
			{
				strategy: "Start DeFi",
				description:
					"Begin with small positions in established protocols.",
				riskLevel: "low",
				potentialReturn: "3-5% APY",
			},
		];
	}

	const recommendations = [];

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
			potentialReturn: "5-7% APY",
		});

		if (!usedProtocols.has("MARINADE_STAKING")) {
			recommendations.push({
				strategy: "Liquid Staking",
				description:
					"Use Marinade Finance for liquid staking to earn staking rewards while maintaining liquidity.",
				riskLevel: "low",
				potentialReturn: "6-8% APY",
			});
		}
	} else if (riskProfile === "moderate") {
		if (!usedProtocols.has("SOLEND")) {
			recommendations.push({
				strategy: "Supply Stablecoins",
				description:
					"Supply USDC or USDT to Solend to earn lending interest.",
				riskLevel: "medium",
				potentialReturn: "8-12% APY",
			});
		}

		recommendations.push({
			strategy: "Diversified LP",
			description:
				"Provide liquidity to stable pairs on Raydium or Orca.",
			riskLevel: "medium",
			potentialReturn: "10-20% APY",
		});
	} else {
		recommendations.push({
			strategy: "Leveraged Farming",
			description:
				"Use leverage on Solend or Mango Markets for amplified yields.",
			riskLevel: "high",
			potentialReturn: "20-40% APY with risk",
		});

		if (!usedProtocols.has("MANGO_MARKETS")) {
			recommendations.push({
				strategy: "Perpetual Trading",
				description:
					"Trade perpetual futures on Mango Markets or Drift Protocol.",
				riskLevel: "high",
				potentialReturn: "Variable",
			});
		}
	}

	return recommendations as {
		strategy: string;
		description: string;
		riskLevel: "low" | "medium" | "high";
		potentialReturn: string;
	}[];
}

async function fetchWalletTransactions(
	publicKey: string,
	limit: number = 20
): Promise<WalletActivity[]> {
	try {
		const cachedData = walletCache.get(publicKey);
		console.log("Cached Data(384) : ", JSON.stringify(cachedData));
		if (cachedData && Date.now() - cachedData.lastUpdated < 5 * 60 * 1000) {
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

				const timestamp = sig.blockTime
					? sig.blockTime * 1000
					: Date.now();
				const type = classifyTransaction(tx);
				const value = estimateTransactionValue(tx);
				const success = tx.meta?.err === null;

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

async function generateWalletProfile(
	publicKey: string,
	activities: WalletActivity[]
): Promise<WalletProfile> {
	let cachedData = walletCache.get(publicKey);
	console.log("CachedData(474) : ", cachedData);
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
	const firstActivityDate =
		timestamps.length > 0 ? Math.min(...timestamps) : 0;
	const lastActivityDate =
		timestamps.length > 0 ? Math.max(...timestamps) : 0;

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

	console.log("Favorite Protocol(514): ", JSON.stringify(favoriteProtocols));

	const transactionVolume = activities
		.filter((a) => a.value !== undefined)
		.reduce((sum, a) => sum + (a.value || 0), 0);

	console.log("Transaction Volume(521)", transactionVolume.toString());

	let riskProfile: "conservative" | "moderate" | "aggressive" = "moderate";
	const swapCount = activities.filter((a) => a.type === "Swap").length;
	console.log("Total Swap Count (526) :", swapCount);
	const tradingCount = activities.filter((a) => a.type === "Trading").length;
	console.log("Trading Count(528): ", tradingCount);
	const lendingCount = activities.filter((a) => a.type === "Lending").length;
	console.log("Lending count(530) : ", lendingCount);

	if (
		tradingCount > 5 ||
		activities.some(
			(a) => identifyProtocol(a.programId) === "MANGO_MARKETS"
		)
	) {
		riskProfile = "aggressive";
	} else if (swapCount > 10 || lendingCount > 0) {
		riskProfile = "moderate";
	} else {
		riskProfile = "conservative";
	}

	console.log("Final risk profile:(545) ", riskProfile);

	const uniqueProtocols = new Set(
		activities.map((a) => identifyProtocol(a.programId))
	).size;
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

	cachedData = walletCache.get(publicKey);
	if (cachedData) {
		walletCache.set(publicKey, {
			...cachedData,
			profile,
		});
	}

	return profile;
}

async function analyzeDeFiPositions(
	publicKey: string
): Promise<DeFiPosition[]> {
	const cachedData = walletCache.get(publicKey);
	if (cachedData?.defiPositions) {
		return cachedData.defiPositions;
	}

	try {
		const positions: DeFiPosition[] = [];
		const activities = cachedData?.activities || [];
		console.log("Activities(620): ", activities);

		const activityGroups = new Map<string, WalletActivity[]>();

		activities.forEach((activity) => {
			if (activity.success) {
				const protocol = identifyProtocol(activity.programId);
				const key = `${protocol}-${activity.type}`;
				if (!activityGroups.has(key)) {
					activityGroups.set(key, []);
				}
				activityGroups.get(key)?.push(activity);
			}
		});

		const stakingActivities = activities.filter(
			(a) => a.type === "Staking" && a.success
		);
		for (const activity of stakingActivities) {
			positions.push({
				protocol: identifyProtocol(activity.programId),
				type: "Staking",
				tokenA: activity.token,
				value: activity.value,
				apy: 5.0 + Math.random() * 3.0,
				timestamp: activity.timestamp,
			});
		}

		const swapActivities = activities.filter(
			(a) =>
				(a.type === "Swap" ||
					identifyProtocol(a.programId) === "FLUXBEAM") &&
				a.success
		);

		console.log("Swap activities(655): ", swapActivities);

		if (swapActivities.length > 0) {
			// Group by recent time periods (last 24h, 7d, 30d)
			const now = Date.now();
			const recent = swapActivities.filter(
				(a) => now - a.timestamp < 24 * 60 * 60 * 1000
			);

			if (recent.length > 0) {
				positions.push({
					protocol: "FLUXBEAM",
					type: "Trading",
					value: recent.reduce((sum, a) => sum + (a.value || 0), 0),
					timestamp: Math.max(...recent.map((a) => a.timestamp)),
				});
			}
		}

		const lendingActivities = activities.filter(
			(a) => a.type === "Lending" && a.success
		);
		for (const activity of lendingActivities) {
			positions.push({
				protocol: identifyProtocol(activity.programId),
				type: "Lending",
				tokenA: activity.token,
				value: activity.value,
				apy: 3.0 + Math.random() * 4.0,
				timestamp: activity.timestamp,
			});
		}

		const lpActivities = activities.filter(
			(a) =>
				a.type === "Account Creation" &&
				(identifyProtocol(a.programId) === "RAYDIUM_SWAP" ||
					identifyProtocol(a.programId) === "ORCA_SWAP")
		);

		for (const activity of lpActivities) {
			positions.push({
				protocol: identifyProtocol(activity.programId),
				type: "Liquidity",
				value: activity.value,
				timestamp: activity.timestamp,
				apy: 8.0 + Math.random() * 4.0,
			});
		}

		if (swapActivities.length > 0) {
			const totalVolume = swapActivities.reduce(
				(sum, a) => sum + (a.value || 0),
				0
			);
			const averageSize = totalVolume / swapActivities.length;

			positions.push({
				protocol: "Aggregate",
				type: "Trading Statistics",
				value: totalVolume,
				tokenA: "Multiple",
				timestamp: Date.now(),
			});
		}

		if (cachedData) {
			walletCache.set(publicKey, {
				...cachedData,
				defiPositions: positions,
			});
		}
		console.log("Analyzed Positions(723): ", JSON.stringify(activities));

		return positions;
	} catch (error) {
		console.error("Error analyzing DeFi positions:", error);
		return [];
	}
}

function formatActivityHistory(
	activities: WalletActivity[],
	walletAddress: string
): string {
	// Group activities by type
	const activityTypes = activities.reduce((acc, activity) => {
		acc[activity.type] = (acc[activity.type] || []).concat(activity);
		return acc;
	}, {} as Record<string, WalletActivity[]>);

	// Calculate total volume
	const totalVolume = activities.reduce(
		(sum, activity) => sum + (activity.value || 0),
		0
	);

	// Get date range
	const timestamps = activities.map((a) => a.timestamp);
	const oldestDate = new Date(Math.min(...timestamps));
	const newestDate = new Date(Math.max(...timestamps));

	// Type-specific emojis
	const typeEmoji = {
		"Transfer": "💸",
		"Swap": "🔄",
		"Mint": "🌟",
		"Staking": "🥩",
		"Trading": "📊",
		"Lending": "💰",
		"Other": "📝",
	};

	return `
# Wallet Activity Report

**Wallet Address:** \`${walletAddress}\`
**Time Period:** ${oldestDate.toISOString()} to ${newestDate.toISOString()}
**Total Transactions:** ${activities.length}
**Total Volume:** ${totalVolume.toFixed(4)} SOL

## Activity Summary
${Object.entries(activityTypes)
	.map(
		([type, acts]) =>
			`- ${typeEmoji[type as keyof typeof typeEmoji] || "•"} ${type}: ${
				acts.length
			} transactions`
	)
	.join("\n")}

## Detailed Transaction History
${activities
	.map(
		(activity) => `
### ${
			typeEmoji[activity.type as keyof typeof typeEmoji] || "•"
		} Transaction at ${new Date(activity.timestamp).toISOString()}
- **Type:** ${activity.type}
- **Value:** ${activity.value ? activity.value.toFixed(6) + " SOL" : "N/A"}
- **Program:** ${identifyProtocol(activity.programId)}
- **Status:** ${activity.success ? "✅ Success" : "❌ Failed"}
- **Signature:** \`${activity.signature}\`
${activity.description ? `- **Description:** ${activity.description}` : ""}`
	)
	.join("\n")}

## Transaction Patterns
- **Most Common Activity:** ${
		Object.entries(activityTypes).sort(
			(a, b) => b[1].length - a[1].length
		)[0][0]
	}
- **Average Transaction Value:** ${(totalVolume / activities.length).toFixed(
		4
	)} SOL
- **Activity Frequency:** ${(
		(activities.length /
			(Math.max(...timestamps) - Math.min(...timestamps))) *
		(24 * 60 * 60 * 1000)
	).toFixed(2)} transactions per day

## Program Interaction Summary
${Array.from(new Set(activities.map((a) => a.programId)))
	.map((programId) => {
		const programActivities = activities.filter(
			(a) => a.programId === programId
		);
		return `- ${identifyProtocol(programId)}: ${
			programActivities.length
		} interactions`;
	})
	.join("\n")}

*This activity report includes the last ${
		activities.length
	} transactions. For a full analysis, use the analyzeWallet tool.*
`;
}

function formatWalletAnalysis(
	profile: WalletProfile,
	patterns: Array<{
		patternType: string;
		confidence: number;
		description: string;
	}>,
	positions: DeFiPosition[],
	recommendations: Array<{
		strategy: string;
		description: string;
		riskLevel: string;
		potentialReturn: string;
	}>,
	recentActivities: WalletActivity[]
): string {
	const riskEmoji = {
		conservative: "🟢",
		moderate: "🟡",
		aggressive: "🔴",
	};

	const activityTypeCount = recentActivities.reduce((acc, activity) => {
		acc[activity.type] = (acc[activity.type] || 0) + 1;
		return acc;
	}, {} as Record<string, number>);

	return `
		# Wallet Analysis Report ${riskEmoji[profile.riskProfile]}

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
		### ${pattern.patternType} (${(pattern.confidence * 100).toFixed(
					1
				)}% confidence)
		${pattern.description}`
			)
			.join("\n")}

		## Active DeFi Positions
		${
			positions.length === 0
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
						.join("\n")
		}

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
		- Protocol Diversity: ${
			profile.favoriteProtocols.length
		} different protocols used

		## Safety Tips
		- Always verify transaction details before signing
		- Consider using hardware wallet for large holdings
		- Maintain a diversified portfolio across different protocols
		- Monitor position health regularly
		${
			profile.riskProfile === "aggressive"
				? "- Consider setting stop-loss orders for trading positions"
				: ""
		}
		${
			profile.portfolioDiversification < 30
				? "- Consider diversifying across more protocols to reduce risk"
				: ""
		}

		*This analysis is based on on-chain activity and is provided for informational purposes only.*
		`;
}

function formatTransactionDetails(tx: {
	signature: string;
	blockTime: number;
	fee: number;
	status: string;
	type: string;
	accounts: string[];
	programIds: Array<{ id: string; name: string }>;
}): string {
	const statusEmoji = tx.status === "Success" ? "✅" : "❌";
	const typeEmoji = {
		"Transfer": "💸",
		"Swap": "🔄",
		"Mint": "🌟",
		"Staking": "🥩",
		"Trading": "📊",
		"Lending": "💰",
		"Other": "📝",
	};

	// Analyze account roles
	const accountRoles = tx.accounts.map((account) => {
		if (account === "11111111111111111111111111111111")
			return "System Program";
		if (account === "ComputeBudget111111111111111111111111111111")
			return "Compute Budget Program";
		if (tx.programIds.some((p) => p.id === account)) return "Program";
		return "User Account";
	});

	// Format the date in a readable way
	const txDate = new Date(tx.blockTime);
	const timeAgo = Math.floor((Date.now() - tx.blockTime) / 1000);
	const timeAgoStr =
		timeAgo < 60
			? `${timeAgo} seconds ago`
			: timeAgo < 3600
			? `${Math.floor(timeAgo / 60)} minutes ago`
			: timeAgo < 86400
			? `${Math.floor(timeAgo / 3600)} hours ago`
			: `${Math.floor(timeAgo / 86400)} days ago`;

	return `
		# Transaction Details ${statusEmoji}

		## Basic Information
		**Type:** ${typeEmoji[tx.type as keyof typeof typeEmoji] || "📄"} ${tx.type}
		**Status:** ${tx.status}
		**Signature:** \`${tx.signature}\`
		**Timestamp:** ${txDate.toISOString()} (${timeAgoStr})
		**Transaction Fee:** ${tx.fee} SOL

		## Program Interaction
		${tx.programIds
			.map(
				(program) =>
					`- **${program.name || "Unknown Program"}** (\`${
						program.id
					}\`)`
			)
			.join("\n")}

		## Account Participants
		${tx.accounts
			.map(
				(account, index) =>
					`- **${accountRoles[index]}**: \`${account}\``
			)
			.join("\n")}

		## Transaction Analysis
		- **Complexity:** ${
			tx.programIds.length > 1
				? "Complex (Multiple Programs)"
				: "Simple (Single Program)"
		}
		- **Program Type:** ${tx.programIds.map((p) => p.name || "Unknown").join(", ")}
		- **Account Count:** ${tx.accounts.length} accounts involved
		${
			tx.type === "Transfer"
				? `- **Transfer Type:** ${
						tx.programIds.some(
							(p) =>
								p.id ===
								"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
						)
							? "Token Transfer"
							: "SOL Transfer"
				  }`
				: ""
		}

		## Security Considerations
		- Always verify transaction signatures
		- Check program IDs match expected addresses
		- Confirm account permissions and roles
		${tx.fee > 0.001 ? "- **Note:** Higher than average transaction fee" : ""}

		*This analysis is based on on-chain data and is provided for informational purposes only.*
		`;
}

server.tool(
	"fetchWalletActivity",
	"Fetches the transaction activity history for a Solana wallet address",
	{
		address: z.string(),
		limit: z.number().optional().default(20),
	},
	async ({ address, limit }: { address: string; limit: number }) => {
		try {
			const pubkey = new PublicKey(address);
			const walletAddress = pubkey.toString();
			const activities = await fetchWalletTransactions(
				walletAddress,
				limit
			);

			const formattedHistory = formatActivityHistory(
				activities,
				walletAddress
			);

			return {
				content: [
					{
						type: "text",
						text: formattedHistory,
					},
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
							error:
								error instanceof Error
									? error.message
									: "Unknown error",
							activities: [],
						}),
					},
				],
			};
		}
	}
);

server.tool(
	"analyzeWallet",
	"Analyzes a Solana wallet's DeFi activity and creates a profile with recommendations",
	{
		address: z.string(),
	},
	async ({ address }) => {
		try {
			const pubkey = new PublicKey(address);
			const walletAddress = pubkey.toString();

			const activities = await fetchWalletTransactions(walletAddress, 50);
			const profile = await generateWalletProfile(
				walletAddress,
				activities
			);
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
					{
						type: "text",
						text: formattedAnalysis,
					},
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

server.tool(
	"getTransactionDetails",
	"Gets detailed information about a specific Solana transaction by signature",
	{ signature: z.string() },
	async ({ signature }: { signature: string }) => {
		try {
			const tx = await connection.getParsedTransaction(
				signature as TransactionSignature,
				{ maxSupportedTransactionVersion: 0 }
			);

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

			const blockTime = tx.blockTime || 0;
			const fee = tx.meta?.fee || 0;
			const status = tx.meta?.err === null ? "Success" : "Failed";
			const accounts = tx.transaction.message.accountKeys.map((key) =>
				key.pubkey.toString()
			);
			const programIds = tx.transaction.message.instructions
				.map((ix) => {
					if ("programId" in ix) {
						return (
							ix as PartiallyDecodedInstruction
						).programId.toString();
					}
					return null;
				})
				.filter(Boolean) as string[];
			const type = classifyTransaction(tx);

			const details = {
				signature,
				blockTime: blockTime * 1000,
				fee: fee / LAMPORTS_PER_SOL,
				status,
				type,
				accounts,
				programIds: programIds.map((id) => ({
					id,
					name: identifyProtocol(id),
				})),
			};

			const formattedDetails = formatTransactionDetails(details);

			return {
				content: [
					{
						type: "text",
						text: formattedDetails,
					},
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
							error:
								error instanceof Error
									? error.message
									: "Unknown error",
						}),
					},
				],
				isError: true,
			};
		}
	}
);

async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
	// console.log("Solana DeFi Analytics MCP Server started");

	const pubKey = new PublicKey(
		"6MiSFpMFmddFrSqumXZJfk115QbJyecLTrGLmVEx9ABe"
	);
	// const walletAddress = pubKey.toString();

	// const activities = await fetchWalletTransactions(walletAddress, 50);
	// // console.log("Activity(843) : ", activities);

	// const profile = await generateWalletProfile(walletAddress, activities);

	// console.log("Profile(853): ", JSON.stringify(profile));

	// const patterns = analyzeTransactionPatterns(activities);
	// console.log("Analyzed patterns(867): ", JSON.stringify(patterns));

	// // Get DeFi positions
	// const positions = await analyzeDeFiPositions(walletAddress);
	// console.log("Defi Positions(871): ", JSON.stringify(positions));

	// // Generate recommendations
	// const recommendations = recommendStrategies(activities, profile);
	// console.log("Recommendations(875): ", JSON.stringify(recommendations));

	// fetch wallet activity
	const walletAddress = pubKey.toString()
	const activities = await fetchWalletTransactions(walletAddress.toString(), 20);
	const formattedHistory = formatActivityHistory(
		activities,
		walletAddress
	);

	console.log("Formatted activities : ", formattedHistory);
}

main().catch((err: unknown) => {
	const error = err as Error;
	console.error("Error running MCP server: ", error.message);
	process.exit(1);
});
