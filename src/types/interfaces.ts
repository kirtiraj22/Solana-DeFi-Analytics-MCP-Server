export interface WalletActivity {
    timestamp: number;
    signature: string;
    type: string;
    description: string;
    value?: number;
    token?: string;
    programId: string;
    success: boolean;
}

export interface TokenHolding {
    mint: string;
    symbol: string;
    amount: number;
    decimals: number;
    usdValue?: number;
}

export interface DeFiPosition {
    protocol: string;
    type: string;
    tokenA?: string;
    tokenB?: string;
    value?: number;
    apy?: number;
    timestamp: number;
}

export interface WalletProfile {
    address: string;
    activityCount: number;
    firstActivityDate: number;
    lastActivityDate: number;
    favoriteProtocols: { name: string; count: number }[];
    transactionVolume: number;
    riskProfile: "conservative" | "moderate" | "aggressive";
    portfolioDiversification: number;
}

export interface TransactionPattern {
    patternType: string;
    confidence: number;
    description: string;
}

export interface Strategy {
    strategy: string;
    description: string;
    riskLevel: "low" | "medium" | "high";
    potentialReturn: string;
}

export interface TransactionDetails {
    signature: string;
    blockTime: number;
    fee: number;
    status: string;
    type: string;
    accounts: string[];
    programIds: Array<{ id: string; name: string }>;
}

export interface CacheEntry {
    lastUpdated: number;
    activities: WalletActivity[];
    profile?: WalletProfile;
    defiPositions?: DeFiPosition[];
} 