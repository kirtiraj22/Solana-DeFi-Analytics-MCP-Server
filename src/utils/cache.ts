import { CacheEntry } from '../types/interfaces';

class WalletCache {
    private cache: Map<string, CacheEntry>;
    private static instance: WalletCache;

    private constructor() {
        this.cache = new Map();
    }

    public static getInstance(): WalletCache {
        if (!WalletCache.instance) {
            WalletCache.instance = new WalletCache();
        }
        return WalletCache.instance;
    }

    public get(key: string): CacheEntry | undefined {
        return this.cache.get(key);
    }

    public set(key: string, value: CacheEntry): void {
        this.cache.set(key, value);
    }

    public has(key: string): boolean {
        return this.cache.has(key);
    }

    public isStale(key: string, maxAge: number = 5 * 60 * 1000): boolean {
        const entry = this.cache.get(key);
        if (!entry) return true;
        return Date.now() - entry.lastUpdated > maxAge;
    }
}

export const walletCache = WalletCache.getInstance(); 