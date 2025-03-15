import { ParsedTransactionWithMeta, ParsedInstruction, PartiallyDecodedInstruction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { KNOWN_PROGRAMS } from "../config/constants";

export function identifyProtocol(programId: string): string {
    for (const [name, id] of Object.entries(KNOWN_PROGRAMS)) {
        if (id === programId) {
            return name;
        }
    }
    return "Unknown";
}

export function classifyTransaction(tx: ParsedTransactionWithMeta): string {
    if (!tx.transaction.message.instructions || tx.transaction.message.instructions.length === 0) {
        return "Unknown";
    }

    const instructions = tx.transaction.message.instructions;
    const instructionSummary = instructions.map((ix) => ({
        program: (ix as ParsedInstruction).program || "",
        type: (ix as ParsedInstruction).parsed?.type || "",
        programId: typeof ix === "object" && "programId" in ix ? ix.programId.toString() : "",
    }));

    const hasTokenCreation = instructionSummary.some(
        (ix) => ix.type === "initializeMint" || ix.type === "initializeTokenMetadata"
    );
    if (hasTokenCreation) return "Token Creation";

    const hasNftMint = instructionSummary.some(
        (ix) => ix.programId === KNOWN_PROGRAMS.METAPLEX || 
        (ix.type === "mintTo" && ix.program === "spl-token")
    );
    if (hasNftMint) return "NFT Mint";

    const hasDexOperation = instructionSummary.some(
        (ix) => ix.programId === KNOWN_PROGRAMS.RAYDIUM_SWAP ||
        ix.programId === KNOWN_PROGRAMS.ORCA_SWAP ||
        ix.programId === KNOWN_PROGRAMS.JUPITER_AGGREGATOR ||
        ix.programId === KNOWN_PROGRAMS.SERUM_DEX_V3 ||
        ix.programId === KNOWN_PROGRAMS.FLUXBEAM
    );
    if (hasDexOperation) return "Swap";

    if (instructionSummary.some((ix) => ix.programId === KNOWN_PROGRAMS.MARINADE_STAKING)) {
        return "Staking";
    }

    if (instructionSummary.some((ix) => ix.programId === KNOWN_PROGRAMS.SOLEND)) {
        return "Lending";
    }

    const hasTokenTransfer = instructionSummary.some(
        (ix) => (ix.program === "spl-token" && ix.type === "transfer") ||
        (ix.program === "system" && ix.type === "transfer")
    );
    if (hasTokenTransfer) return "Transfer";

    const hasAccountCreation = instructionSummary.some(
        (ix) => ix.program === "spl-associated-token-account" ||
        (ix.program === "system" && ix.type === "createAccount")
    );
    if (hasAccountCreation) return "Account Creation";

    const hasAuthorityChange = instructionSummary.some(
        (ix) => ix.type === "setAuthority" || ix.type === "approve" || ix.type === "revoke"
    );
    if (hasAuthorityChange) return "Authority Update";

    return "Other";
}

export function estimateTransactionValue(tx: ParsedTransactionWithMeta): number | undefined {
    if (!tx.meta) return undefined;

    const preBalances = tx.meta.preBalances;
    const postBalances = tx.meta.postBalances;

    if (preBalances && postBalances && preBalances.length > 0) {
        const feePayer = tx.transaction.message.accountKeys[0].pubkey.toString();
        const feePayerIndex = tx.transaction.message.accountKeys.findIndex(
            (key) => key.pubkey.toString() === feePayer
        );

        if (feePayerIndex >= 0) {
            const balanceDiff = Math.abs(preBalances[feePayerIndex] - postBalances[feePayerIndex]);
            return balanceDiff / LAMPORTS_PER_SOL;
        }
    }

    return undefined;
} 