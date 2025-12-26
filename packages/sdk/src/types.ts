
// Basic Storage Interface
export interface StorageInterface {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export class MemoryStorage implements StorageInterface {
    private storage = new Map<string, string>();

    getItem(key: string): string | null {
        return this.storage.get(key) || null;
    }

    setItem(key: string, value: string): void {
        this.storage.set(key, value);
    }

    removeItem(key: string): void {
        this.storage.delete(key);
    }
}

// Lit Types
export interface AuthSig {
    sig: string;
    derivedVia: string;
    signedMessage: string;
    address: string;
}

export interface SessionSigs {
    [key: string]: AuthSig;
}

export interface AccessControlCondition {
    contractAddress: string;
    standardContractType: string;
    chain: string;
    method: string;
    parameters: string[];
    returnValueTest: {
        comparator: string;
        value: string;
    };
}

export interface UnifiedAccessControlCondition {
    conditionType?: string;
    returnValueTest?: {
        key: string;
        comparator: string;
        value: string;
    };
    [key: string]: any;
}

export interface PKPMintResult {
    tokenId: string;
    publicKey: string;
    ethAddress: string;
    nearImplicitAccount: string;
    txHash?: string;
}

export interface NearSessionKey {
    publicKey: string;
    secretKey: string;
}

// NEAR Types
export interface NearTransactionConfig {
    receiverId: string;
    actions: any[];
}

// Wallet Interface (Abstracting @near-wallet-selector/core)
export interface WalletInterface {
    signAndSendTransaction(params: NearTransactionConfig): Promise<any>;
    signAndSendTransactions(params: { transactions: NearTransactionConfig[] }): Promise<any>;
    getAccounts(): Promise<Array<{ accountId: string }>>;
}
