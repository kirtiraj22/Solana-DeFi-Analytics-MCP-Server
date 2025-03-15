import { WalletActivity, TransactionPattern } from "../types/interfaces";

export function analyzeTransactionPatterns(
	activities: WalletActivity[]
): TransactionPattern[] {
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

	const patterns: TransactionPattern[] = [];

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
