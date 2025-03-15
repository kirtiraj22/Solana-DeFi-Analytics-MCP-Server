import { clusterApiUrl } from "@solana/web3.js";
import "dotenv/config";

export const RPC_URL = process.env.SOLANA_RPC_URL || clusterApiUrl("mainnet-beta");

export const KNOWN_PROGRAMS = {
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
} as const;

export const TYPE_EMOJI = {
    "Transfer": "💸",
    "Swap": "🔄",
    "Mint": "🌟",
    "Staking": "🥩",
    "Trading": "📊",
    "Lending": "💰",
    "Other": "📝",
} as const;

export const RISK_EMOJI = {
    conservative: "🟢",
    moderate: "🟡",
    aggressive: "🔴",
} as const; 