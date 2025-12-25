import { keyStores, KeyPair, connect, providers, transactions, utils } from 'near-api-js';
import { YouTickConfig, DEFAULT_CONFIG } from '../config';
import BN from 'bn.js';

export class SessionManager {
    private keyStore: keyStores.KeyStore;
    private accountId: string;
    private config: YouTickConfig;

    constructor(accountId: string, config: YouTickConfig = DEFAULT_CONFIG, keyStore?: keyStores.KeyStore) {
        this.accountId = accountId;
        this.config = config;

        if (keyStore) {
            this.keyStore = keyStore;
        } else if (typeof window !== 'undefined') {
            this.keyStore = new keyStores.BrowserLocalStorageKeyStore();
        } else {
            this.keyStore = new keyStores.InMemoryKeyStore();
        }
    }

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
            // Permission can be 'FullAccess' (string) or object with FunctionCall
            if (typeof permission === 'object' && 'FunctionCall' in permission) {
                if (permission.FunctionCall.receiver_id !== this.config.contractId) {
                    console.warn(`Session key found but for wrong contract (${permission.FunctionCall.receiver_id} vs ${this.config.contractId}). Removing.`);
                    await this.keyStore.removeKey(this.config.networkId, this.accountId);
                    return false;
                }
            }

            return true;
        } catch (e) {
            console.warn("Error checking session key on-chain. Assuming local key is valid.", e);
            return true;
        }
    }

    async createSessionKey(wallet: any, gasAmount: string = '1'): Promise<void> {
        const keyPair = KeyPair.fromRandom('ed25519');
        const publicKey = keyPair.getPublicKey().toString();
        await this.keyStore.setKey(this.config.networkId, this.accountId, keyPair);
        await this.batchInitialSetup(wallet, publicKey, gasAmount);
    }

    async createSessionKeyMinimal(wallet: any): Promise<void> {
        const keyPair = KeyPair.fromRandom('ed25519');
        const publicKey = keyPair.getPublicKey().toString();
        await this.keyStore.setKey(this.config.networkId, this.accountId, keyPair);

        // Minimal deposit for PKP users
        await this.batchInitialSetup(wallet, publicKey, '0.5');
    }

    /**
     * Batch initial setup: Gas deposit + Session Key
     */
    private async batchInitialSetup(
        wallet: any,
        sessionKeyPublicKey: string,
        gasAmount: string
    ) {
        return await wallet.signAndSendTransactions({
            transactions: [
                {
                    receiverId: this.config.contractId,
                    actions: [
                        transactions.functionCall(
                            'deposit_funds',
                            Buffer.from(JSON.stringify({})),
                            new BN('30000000000000'), // 30 TGas
                            new BN(utils.format.parseNearAmount(gasAmount) || '0')
                        )
                    ]
                },
                {
                    receiverId: this.accountId,
                    actions: [
                        transactions.addKey(
                            utils.PublicKey.from(sessionKeyPublicKey),
                            transactions.functionCallAccessKey(
                                this.config.contractId,
                                [], // All methods allowed
                                new BN(utils.format.parseNearAmount('0.25') || '0') // 0.25 NEAR allowance
                            )
                        )
                    ]
                }
            ]
        });
    }

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

        const outcome = await account.functionCall({
            contractId: this.config.contractId,
            methodName: method,
            args,
            gas: new BN(gas),
            attachedDeposit: new BN(0)
        });

        return providers.getTransactionLastResult(outcome);
    }

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

        return providers.getTransactionLastResult(outcome);
    }

    // ... helper methods for withdrawing funds can remain strictly if needed, 
    // but they are simple wrappers around wallet calls or callMethod.
}
