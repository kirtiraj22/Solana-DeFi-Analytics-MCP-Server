import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import "dotenv/config";
import { fetchWalletActivityTool } from "./tools/fetchWalletActivity";
import { analyzeWalletTool } from "./tools/analyzeWallet";
import { getTransactionDetailsTool } from "./tools/getTransactionDetails";

const server = new McpServer({
	name: "Solana DeFi Analytics MCP Server",
	version: "1.0.0",
})

server.tool(
	fetchWalletActivityTool.name,
	fetchWalletActivityTool.description,
	fetchWalletActivityTool.parameters,
	async (args, extra) => {
		const result = await fetchWalletActivityTool.execute(args);
		return {
			...result,
			content: result.content.map(item => ({
				...item,
				type: "text" as const
			}))
		};
	}
);

server.tool(
	analyzeWalletTool.name,
	analyzeWalletTool.description,
	analyzeWalletTool.parameters,
	async (args, extra) => {
		const result = await analyzeWalletTool.execute(args);
		return {
			...result,
			content: result.content.map(item => ({
				...item,
				type: "text" as const
			}))
		};
	}
);

server.tool(
	getTransactionDetailsTool.name,
	getTransactionDetailsTool.description,
	getTransactionDetailsTool.parameters,
	async (args, extra) => {
		const result = await getTransactionDetailsTool.execute(args);
		return {
			...result,
			content: result.content.map(item => ({
				...item,
				type: "text" as const
			}))
		};
	}
);

async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

main().catch((err: unknown) => {
	const error = err as Error;
	console.error("Error running MCP server:", error.message);
	process.exit(1);
});
