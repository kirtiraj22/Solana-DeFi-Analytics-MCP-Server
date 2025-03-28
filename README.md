# Solana DeFi Analytics MCP Server

A Model Context Protocol (MCP) server that provides comprehensive analytics and insights for Solana wallets and their DeFi activities.

## Features

- **Wallet Activity Analysis**: Track and analyze transaction history, patterns, and behaviors
- **DeFi Position Tracking**: Monitor staking, lending, and liquidity positions across protocols
- **Risk Profiling**: Assess wallet risk profiles based on transaction patterns
- **Strategy Recommendations**: Get personalized DeFi strategy suggestions
- **Transaction Details**: Detailed breakdown and analysis of individual transactions

## Supported Protocols

- Raydium (Swap)
- Orca (Swap)
- Jupiter (Aggregator)
- Marinade (Staking)
- Serum DEX V3
- Solend (Lending)
- Mango Markets
- FluxBeam
- Metaplex (NFTs)

## Tools

### 1. fetchWalletActivity
Retrieves detailed transaction history for a Solana wallet address.

```typescript
{
    address: string,
    limit?: number // default: 20
}
```

### 2. analyzeWallet
Performs comprehensive analysis of a wallet's DeFi activity and generates recommendations.

```typescript
{
    address: string
}
```

### 3. getTransactionDetails
Provides detailed information about a specific Solana transaction.

```typescript
{
    signature: string
}
```

## Installation

1. Clone the repository:
```bash
git clone https://github.com/kirtiraj22/Solana-DeFi-Analytics-MCP-Server
cd solana-mcp
```

2. Install dependencies:
```bash
pnpm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Configure the following variables in `.env`:
```
SOLANA_RPC_URL=your_rpc_url_here
```

## Usage

Start the MCP server:
```bash
pnpm run dev
```

To Test via the MCP Inspector run the following commands: 
```bash
pnpm build
```
```
npx @modelcontextprotocol/inspector node build/index.js
```

### For Claude Desktop client, add the following code to the claude_desktop_config.json : 

```javascript
{
	"mcpServers": {
		"filesystem": {
			"command": "node",
			"args": [
				"<PROJECT_PATHL>\\solana-mcp\\build\\index.js"
			],
			"env": {
				"SOLANA_RPC_URL": "<YOUR_SOLANA_RPC_URL>"
			}
		}
	}
}

```

## Project Structure

```
src/
├── analyzers/          # Analysis logic for patterns, DeFi positions, etc.
├── config/             # Configuration constants and settings
├── formatters/         # Output formatting for different types of data
├── services/          # Core services for blockchain interaction
├── tools/             # MCP tool implementations
├── types/             # TypeScript interfaces and types
└── utils/             # Utility functions and helpers
```

## Features in Detail

### Wallet Analysis
- Transaction history tracking
- Protocol interaction analysis
- Risk profile assessment
- Portfolio diversification **scoring**
- Favorite protocol identification

### DeFi Position Tracking
- Active staking positions
- Lending positions
- Liquidity provisions
- Trading statistics

### Pattern Recognition
- Dollar-cost averaging detection
- Yield farming patterns
- Trading behavior analysis
- Protocol usage patterns

### Risk Assessment
- Trading frequency monitoring
- Protocol diversity evaluation
- Security considerations

### Adding New Features

1. Create new analyzers in `src/analyzers/`
2. Add formatters in `src/formatters/`
3. Implement services in `src/services/`
4. Register new tools in `src/tools/`
