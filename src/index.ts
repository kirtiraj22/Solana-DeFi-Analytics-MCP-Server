import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	Connection,
	LAMPORTS_PER_SOL,
	PublicKey,
	clusterApiUrl,
} from "@solana/web3.js";
import { z } from "zod";

const server = new McpServer({
	name: "Solana MCP Server",
	version: "1.0.0",
});

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

server.tool(
	"getAccountInfo",
	"Used to look up account info by public key(32 byte base58 encoded address)",
	{ publicKey: z.string() },
	async ({ publicKey }) => {
		try {
			const pubkey = new PublicKey(publicKey);
			const accountInfo = await connection.getAccountInfo(pubkey);

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(accountInfo, null, 2),
					},
				],
			};
		} catch (error) {
			return {
				content: [
					{
						type: "text",
						text: `Error: ${(error as Error).message}`,
					},
				],
			};
		}
	}
);

server.tool(
	"getBalance",
	"Used to look up balance by public key (32 byte base58 encoded address)",
	{ publicKey: z.string() },
	async ({ publicKey }) => {
		try {
			const pubkey = new PublicKey(publicKey);
			const balance = await connection.getBalance(pubkey);

			return {
				content: [
					{
						type: "text",
						text: `${
							balance / LAMPORTS_PER_SOL
						} SOL (${balance} lamports)`,
					},
				],
			};
		} catch (error) {
			return {
				content: [
					{
						type: "text",
						text: `Error :${(error as Error).message}`,
					},
				],
			};
		}
	}
);

async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.log("Solana MCP running");
}

main().catch((err: unknown) => {
	const error = err as Error;
	console.error("Error running MCP server: ", error.message);
	process.exit(1);
});
