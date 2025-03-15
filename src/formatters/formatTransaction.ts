import { TransactionDetails } from "../types/interfaces";
import { TYPE_EMOJI } from "../config/constants";

export function formatTransactionDetails(tx: TransactionDetails): string {
	const statusEmoji = tx.status === "Success" ? "✅" : "❌";

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
		**Type:** ${TYPE_EMOJI[tx.type as keyof typeof TYPE_EMOJI] || "📄"} ${tx.type}
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
