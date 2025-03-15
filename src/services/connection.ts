import { Connection } from "@solana/web3.js";
import { RPC_URL } from "../config/constants";

export const connection = new Connection(RPC_URL, {
    commitment: "confirmed",
    disableRetryOnRateLimit: false,
    confirmTransactionInitialTimeout: 60000,
});

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)); 