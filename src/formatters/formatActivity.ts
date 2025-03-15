import { WalletActivity } from "../types/interfaces";
import { identifyProtocol } from "../services/transaction";
import { TYPE_EMOJI } from "../config/constants";

export function formatActivityHistory(
	activities: WalletActivity[],
	walletAddress: string
): string {
	const activityTypes = activities.reduce((acc, activity) => {
		acc[activity.type] = (acc[activity.type] || []).concat(activity);
		return acc;
	}, {} as Record<string, WalletActivity[]>);

	const totalVolume = activities.reduce(
		(sum, activity) => sum + (activity.value || 0),
		0
	);

	const timestamps = activities.map((a) => a.timestamp);
	const oldestDate = new Date(Math.min(...timestamps));
	const newestDate = new Date(Math.max(...timestamps));

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
					`- ${
						TYPE_EMOJI[type as keyof typeof TYPE_EMOJI] || "•"
					} ${type}: ${acts.length} transactions`
			)
			.join("\n")}

        ## Detailed Transaction History
        ${activities
			.map(
				(activity) => `
        ### ${
			TYPE_EMOJI[activity.type as keyof typeof TYPE_EMOJI] || "•"
		} Transaction at ${new Date(activity.timestamp).toISOString()}
        - **Type:** ${activity.type}
        - **Value:** ${
			activity.value ? activity.value.toFixed(6) + " SOL" : "N/A"
		}
        - **Program:** ${identifyProtocol(activity.programId)}
        - **Status:** ${activity.success ? "✅ Success" : "❌ Failed"}
        - **Signature:** \`${activity.signature}\`
        ${
			activity.description
				? `- **Description:** ${activity.description}`
				: ""
		}`
			)
			.join("\n")}

        ## Transaction Patterns
        - **Most Common Activity:** ${
			Object.entries(activityTypes).sort(
				(a, b) => b[1].length - a[1].length
			)[0][0]
		}
        - **Average Transaction Value:** ${(
			totalVolume / activities.length
		).toFixed(4)} SOL
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
