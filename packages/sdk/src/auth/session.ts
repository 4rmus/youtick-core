import { keyStores, KeyPair, connect, providers, transactions, utils } from 'near-api-js';
import { DEFAULT_CONFIG, YouTickConfig } from '../config';
import { batchInitialSetup } from '../utils/batch-transactions';
import { WalletInterface } from '../types';

/**
 * Manages NEAR Session Keys and contract interactions.
 * Session keys allow for a "signless" user experience by using local keys 
 * authorized to call specific contract methods without wallet redirection.
 */
export class SessionManager {
    private keyStore: any;
    public accountId: string;
    private config: YouTickConfig;

    /**
     * Initializes a new SessionManager.
     * @param accountId - The NEAR account ID of the user.
     * @param config - YouTick configuration object (defaults to Testnet).
     * @param keyStore - Optional custom keyStore (defaults to BrowserLocalStorageKeyStore in browser, or InMemoryKeyStore in Node.js).
     */
    constructor(accountId: string, config: YouTickConfig = DEFAULT_CONFIG, keyStore?: any) {
        this.accountId = accountId;
        this.config = config;

        if (keyStore) {
            this.keyStore = keyStore;
        } else if (typeof window !== 'undefined' && window.localStorage) {
            this.keyStore = new keyStores.BrowserLocalStorageKeyStore();
        } else {
            this.keyStore = new keyStores.InMemoryKeyStore();
        }
    }

    /**
     * Checks if a valid session key exists locally and is authorized on-chain.
     * @returns A boolean indicating if the session is active.
     */
    async hasSessionKey(): Promise<boolean> {
        const keyPair = await this.keyStore.getKey(this.config.networkId, this.accountId);
        if (!keyPair) return false;

        // Verify key exists on-chain to avoid stale keys
        try {
            const near = await connect({
                networkId: this.config.networkId,
                keyStore: this.keyStore,
                nodeUrl: this.config.nodeUrl,
            });
            const account = await near.account(this.accountId);
            const accessKeys = await account.getAccessKeys();
            const publicKey = keyPair.getPublicKey().toString();
            const accessKeyInfo = accessKeys.find(k => k.public_key === publicKey);

            if (!accessKeyInfo) {
                console.warn("Session key found locally but not on-chain. Removing.");
                await this.keyStore.removeKey(this.config.networkId, this.accountId);
                return false;
            }

            // Verify the key is for the correct contract
            const permission = accessKeyInfo.access_key.permission;
            if (typeof permission === 'object' && 'FunctionCall' in permission) {
                if (permission.FunctionCall.receiver_id !== this.config.contractId) {
                    console.warn(`Session key found but for wrong contract (${permission.FunctionCall.receiver_id} vs ${this.config.contractId}). Removing.`);
                    await this.keyStore.removeKey(this.config.networkId, this.accountId);
                    return false;
                }
            } else if (permission !== 'FullAccess') {
                // Should be FullAccess or FunctionCall.
            }

            return true;
        } catch (e) {
            console.warn("Error checking session key on-chain (network issue?). Assuming local key is valid.", e);
            return true;
        }
    }

    /**
     * Creates a new session key and optionally deposits gas for the user in a batch transaction.
     * This requires a wallet interaction (redirection) to authorize the new key.
     * @param wallet - Wallet selector interface for signing the setup transaction.
     * @param gasAmount - Amount of NEAR to deposit as prepaid gas (default: '1').
     */
    async createSessionKey(wallet: WalletInterface, gasAmount: string = '1'): Promise<void> {
        // Generate new key pair
        const keyPair = KeyPair.fromRandom('ed25519');
        const publicKey = keyPair.getPublicKey().toString();

        // Store in local storage FIRST (before redirect)
        await this.keyStore.setKey(this.config.networkId, this.accountId, keyPair);

        // Also store directly in localStorage as backup (keyStore might be async)
        if (typeof window !== 'undefined') {
            const keyString = keyPair.toString();
            localStorage.setItem(
                `near-api-js:keystore:${this.accountId}:${this.config.networkId}`,
                keyString
            );
            console.log('Session key saved to localStorage:', publicKey);
        }

        // If no deposit needed, just create the session key
        if (gasAmount === '0' || parseFloat(gasAmount) === 0) {
            const { createSessionKeyOnly } = await import('../utils/batch-transactions.js');
            await createSessionKeyOnly(
                wallet,
                this.accountId,
                this.config.contractId,
                publicKey
            );
        } else {
            // Create session key + deposit in batch
            await batchInitialSetup(
                wallet,
                this.accountId,
                this.config.contractId,
                publicKey,
                gasAmount
            );
        }
    }

    /**
     * Create session key with a minimal deposit optimized for PKP/MPC flows.
     * PKP users typically require less gas but still need prepaid funds for signatures and minting.
     * @param wallet - Wallet selector interface.
     */
    async createSessionKeyMinimal(wallet: WalletInterface): Promise<void> {
        // Generate new key pair
        const keyPair = KeyPair.fromRandom('ed25519');
        const publicKey = keyPair.getPublicKey().toString();

        // Store in local storage
        await this.keyStore.setKey(this.config.networkId, this.accountId, keyPair);

        // Use batch transaction with minimal deposit (0.5 NEAR)
        await batchInitialSetup(
            wallet,
            this.accountId,
            this.config.contractId,
            publicKey,
            '0.5' // Covers: MPC signature (0.25) + NFT mint (0.1) + Event (0.1) = 0.45 NEAR + margin
        );
    }

    /**
     * Saves an existing KeyPair as the session key.
     * @param keyPair - The KeyPair to save.
     */
    async saveSessionKey(keyPair: KeyPair): Promise<void> {
        await this.keyStore.setKey(this.config.networkId, this.accountId, keyPair);
    }

    /**
     * Executes a contract change method using the authorized session key.
     * Does NOT require a wallet popup/redirection.
     * @param method - Name of the contract method.
     * @param args - Arguments for the contract call.
     * @param gas - Maximum amount of gas to use (default: 300 TGas).
     * @returns The parsed result of the contract call.
     */
    async callMethod(method: string, args: any, gas: string = '300000000000000'): Promise<any> {
        const keyPair = await this.keyStore.getKey(this.config.networkId, this.accountId);
        if (!keyPair) {
            throw new Error("No session key found. Please setup account first.");
        }

        const near = await connect({
            networkId: this.config.networkId,
            keyStore: this.keyStore,
            nodeUrl: this.config.nodeUrl,
        });

        const account = await near.account(this.accountId);

        // Call contract method using the session key
        // Note: We cannot attach deposit with a FunctionCallKey!
        // This is why we use the Prepaid Proxy pattern.
        const outcome = await account.functionCall({
            contractId: this.config.contractId,
            methodName: method,
            args,
            gas: BigInt(gas),
            attachedDeposit: BigInt(0)
        });

        // Parse result
        const result = providers.getTransactionLastResult(outcome);
        return result;
    }

    /**
     * Sends a batch of actions to the contract using the session key.
     * @param actions - Array of NEAR native actions.
     * @returns The parsed transaction result.
     */
    async sendBatchTransaction(actions: any[]): Promise<any> {
        const keyPair = await this.keyStore.getKey(this.config.networkId, this.accountId);
        if (!keyPair) {
            throw new Error("No session key found. Please setup account first.");
        }

        const near = await connect({
            networkId: this.config.networkId,
            keyStore: this.keyStore,
            nodeUrl: this.config.nodeUrl,
        });

        const account = await near.account(this.accountId);

        const outcome = await account.signAndSendTransaction({
            receiverId: this.config.contractId,
            actions: actions
        });

        const result = providers.getTransactionLastResult(outcome);
        return result;
    }

    /**
     * Fetches the user's current prepaid gas balance from the contract.
     * @param nodeUrl - Optional alternative NEAR RPC URL.
     * @returns Balance in NEAR as a number.
     */
    async getAccountBalance(nodeUrl?: string): Promise<number> {
        try {
            const provider = new providers.JsonRpcProvider({ url: nodeUrl || this.config.nodeUrl });
            const res = await provider.query({
                request_type: 'call_function',
                account_id: this.config.contractId,
                method_name: 'get_user_balance',
                args_base64: Buffer.from(JSON.stringify({ account_id: this.accountId })).toString('base64'),
                finality: 'final',
            }) as any;
            const balString = JSON.parse(Buffer.from(res.result).toString());
            return parseFloat(utils.format.formatNearAmount(balString));
        } catch (e) {
            console.warn("Error getting gas balance (maybe not registered?):", e);
            return 0;
        }
    }

    /**
     * Checks if the user has enough prepaid gas for typical operations.
     * @param nodeUrl - Optional alternative RPC.
     * @param minAmount - Minimum required NEAR balance (default: 1.0).
     */
    async hasSufficientGas(nodeUrl?: string, minAmount: number = 1.0): Promise<boolean> {
        const currentBalance = await this.getAccountBalance(nodeUrl);
        console.log(`Current Prepaid Gas Balance: ${currentBalance} NEAR, Required: ${minAmount}`);
        return currentBalance >= minAmount;
    }

    /**
     * Ensures the user has enough gas, triggering a top-up transaction if needed.
     * @param wallet - Wallet selector interface for signing the top-up.
     * @param nodeUrl - Optional alternative RPC.
     * @param minAmount - Minimum NEAR balance required.
     */
    async ensureGas(wallet: WalletInterface, nodeUrl?: string, minAmount: number = 1.0): Promise<void> {
        const sufficient = await this.hasSufficientGas(nodeUrl, minAmount);
        if (!sufficient) {
            console.log(`Low gas, triggering Top Up...`);
            // Deposit 1 NEAR if low
            await this.topUpGas(wallet, '1');
        }
    }

    /**
     * Tops up the user's prepaid gas balance by calling 'deposit_funds'.
     * Requires wallet interaction.
     * @param wallet - Wallet selector.
     * @param amount - Amount of NEAR to deposit.
     */
    /**
     * Tops up the user's prepaid gas balance by calling 'deposit_funds'.
     * Requires wallet interaction.
     * @param wallet - Wallet selector.
     * @param amount - Amount of NEAR to deposit.
     */
    async topUpGas(wallet: WalletInterface, amount: string) {
        console.log(`Topping up gas: ${amount} NEAR`);
        const action = transactions.functionCall(
            'deposit_funds',
            Buffer.from(JSON.stringify({})),
            BigInt('30000000000000'), // 30 TGas
            BigInt(utils.format.parseNearAmount(amount) || '0')
        );

        await wallet.signAndSendTransaction({
            receiverId: this.config.contractId,
            actions: [action as any]
        });
    }

    /**
     * Funds another user's prepaid gas balance.
     * This is the "Sponsor-Agnostic Relayer" logic, allowing creators or sponsors 
     * to fund their users' gas for a frictionless onboarding experience.
     * @param sponsorWallet - Wallet selector of the entity funding the gas.
     * @param targetAccountId - The NEAR account to receive the prepaid gas.
     * @param amount - Amount of NEAR to deposit.
     */
    async fundUser(sponsorWallet: WalletInterface, targetAccountId: string, amount: string) {
        console.log(`Sponsoring gas for ${targetAccountId}: ${amount} NEAR`);
        const action = transactions.functionCall(
            'deposit_funds',
            Buffer.from(JSON.stringify({ account_id: targetAccountId })),
            BigInt('30000000000000'),
            BigInt(utils.format.parseNearAmount(amount) || '0')
        );

        await sponsorWallet.signAndSendTransaction({
            receiverId: this.config.contractId,
            actions: [action as any]
        });
    }

    /**
     * Withdraws prepaid gas funds back to the user's wallet.
     * Requires wallet interaction (1 yocto deposit for security).
     * @param wallet - Wallet selector.
     * @param amount - Amount of NEAR to withdraw.
     */
    async withdrawFunds(wallet: WalletInterface, amount: string) {
        console.log(`Withdrawing funds: ${amount} NEAR`);
        const action = transactions.functionCall(
            'withdraw_funds',
            Buffer.from(JSON.stringify({ amount: utils.format.parseNearAmount(amount) || '0' })),
            BigInt('30000000000000'), // 30 TGas
            BigInt('1') // Attach 1 yocto for security
        );

        await wallet.signAndSendTransaction({
            receiverId: this.config.contractId,
            actions: [action as any]
        });
    }

    /**
     * Withdraws funds using the session key (no wallet popup).
     * Only works if the user has a valid session key and the contract permits it.
     * @param amount - Amount of NEAR to withdraw.
     */
    async withdrawFundsSilent(amount: string) {
        console.log(`Withdrawing funds silently (Session Key): ${amount} NEAR`);
        // Uses Session Key -> No User Signature required!
        // Uses withdraw_funds_prepaid which doesn't require 1 yocto deposit
        return await this.callMethod(
            'withdraw_funds_prepaid',
            {},
            '30000000000000'
        );
    }

    /**
     * Executes a read-only view method on the contract.
     * @param method - Name of the view method.
     * @param args - Arguments for the view method.
     * @returns The parsed result.
     */
    async viewMethod(method: string, args: any = {}): Promise<any> {
        try {
            const provider = new providers.JsonRpcProvider({ url: this.config.nodeUrl });
            const res = await provider.query({
                request_type: 'call_function',
                account_id: this.config.contractId,
                method_name: method,
                args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
                finality: 'final',
            }) as any;
            return JSON.parse(Buffer.from(res.result).toString());
        } catch (e) {
            console.error(`Error in viewMethod (${method}):`, e);
            throw e;
        }
    }

    /**
     * Removes the session key from local storage.
     */
    async logout(): Promise<void> {
        await this.keyStore.removeKey(this.config.networkId, this.accountId);
        if (typeof window !== 'undefined') {
            localStorage.removeItem(`near-api-js:keystore:${this.accountId}:${this.config.networkId}`);
        }
    }
}
