import { WalletActivity, DeFiPosition } from "../types/interfaces";
import { walletCache } from "../utils/cache";
import { identifyProtocol } from "../services/transaction";

export async function analyzeDeFiPositions(
	publicKey: string
): Promise<DeFiPosition[]> {
	const cachedData = walletCache.get(publicKey);
	if (cachedData?.defiPositions) {
		return cachedData.defiPositions;
	}

	const positions: DeFiPosition[] = [];
	const activities = cachedData?.activities || [];

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
	stakingActivities.forEach((activity) => {
		positions.push({
			protocol: identifyProtocol(activity.programId),
			type: "Staking",
			tokenA: activity.token,
			value: activity.value,
			apy: 5.0 + Math.random() * 3.0,
			timestamp: activity.timestamp,
		});
	});

	const swapActivities = activities.filter(
		(a) =>
			(a.type === "Swap" ||
				identifyProtocol(a.programId) === "FLUXBEAM") &&
			a.success
	);

	if (swapActivities.length > 0) {
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
	lendingActivities.forEach((activity) => {
		positions.push({
			protocol: identifyProtocol(activity.programId),
			type: "Lending",
			tokenA: activity.token,
			value: activity.value,
			apy: 3.0 + Math.random() * 4.0,
			timestamp: activity.timestamp,
		});
	});

	const lpActivities = activities.filter(
		(a) =>
			a.type === "Account Creation" &&
			(identifyProtocol(a.programId) === "RAYDIUM_SWAP" ||
				identifyProtocol(a.programId) === "ORCA_SWAP")
	);

	lpActivities.forEach((activity) => {
		positions.push({
			protocol: identifyProtocol(activity.programId),
			type: "Liquidity",
			value: activity.value,
			timestamp: activity.timestamp,
			apy: 8.0 + Math.random() * 4.0,
		});
	});

	if (swapActivities.length > 0) {
		const totalVolume = swapActivities.reduce(
			(sum, a) => sum + (a.value || 0),
			0
		);
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

	return positions;
}
