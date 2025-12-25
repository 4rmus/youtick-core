import * as _lit_protocol_types from '@lit-protocol/types';
import { LitNodeClient } from '@lit-protocol/lit-node-client';
import { ethers } from 'ethers';
import { keyStores } from 'near-api-js';

interface YouTickConfig {
    networkId: string;
    contractId: string;
    nodeUrl: string;
    litNetwork: "datil-dev" | "datil-test" | "datil";
    litActionIpfsId?: string;
    rpcUrl?: string;
}
declare const DEFAULT_CONFIG: YouTickConfig;

interface StorageInterface {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

declare class LitClient {
    private litNodeClient;
    private config;
    private storage;
    private SESSION_CACHE_KEY;
    constructor(config?: YouTickConfig, storage?: StorageInterface);
    connect(): Promise<void>;
    /**
     * Get session signatures using a PKP (signless experience).
     * Uses Lit Action to verify NEAR signature and authorize the PKP.
     */
    getSessionSigsWithPKP(pkpPublicKey: string, pkpEthAddress: string, nearAccountId: string, capacityDelegationAuthSig?: any): Promise<_lit_protocol_types.SessionSigsMap>;
    encryptFile(file: File | Blob, accessControlConditions: any[], authSig?: any, chain?: string, sessionSigs?: any): Promise<_lit_protocol_types.EncryptResponse>;
    decryptFile(ciphertext: string, dataToEncryptHash: string, accessControlConditions: any[], authSig?: any, chain?: string, sessionSigs?: any): Promise<Uint8Array>;
}

declare class PKPManager {
    private litNodeClient;
    constructor(litNodeClient: LitNodeClient);
    /**
     * Mint a new PKP for the user using their NEAR account + MPC-derived ETH wallet as Auth Method.
     * Uses Lit Relay Server for gas-free minting.
     */
    mintPKPWithNear(nearAccountId: string, nearPublicKey: string, signature: string, message: string, signer?: any, relayApiKey?: string, useMock?: boolean): Promise<{
        tokenId: string;
        publicKey: string;
        ethAddress: string;
        nearImplicitAccount: string;
    }>;
    /**
     * Mint a PKP directly via contracts with Lit Action auth method.
     */
    mintPKPDirect(signer: any, litActionIpfsCid: string, rpcUrl?: string): Promise<{
        tokenId: string;
        publicKey: any;
        ethAddress: string;
        txHash: any;
    }>;
    getPKPSessionSigs(pkpPublicKey: string, nearSignCallback: () => Promise<{
        sig: string;
        msg: string;
        pk: string;
    }>): Promise<_lit_protocol_types.SessionSigsMap>;
}

declare function deriveEthAddress(accountId: string, path: string, config?: YouTickConfig): Promise<string>;
declare function signWithMPC(wallet: any, accountId: string, path: string, message: string, config?: YouTickConfig): Promise<any>;
declare class MPCSigner extends ethers.AbstractSigner {
    private wallet;
    private nearAccountId;
    private derivationPath;
    private _address;
    private config;
    constructor(wallet: any, nearAccountId: string, derivationPath?: string, provider?: ethers.Provider, config?: YouTickConfig);
    getAddress(): Promise<string>;
    connect(provider: ethers.Provider): MPCSigner;
    signTransaction(tx: ethers.TransactionRequest): Promise<string>;
    signMessage(message: string | Uint8Array): Promise<string>;
    signTypedData(domain: ethers.TypedDataDomain, types: Record<string, ethers.TypedDataField[]>, value: Record<string, any>): Promise<string>;
}

declare class SessionManager {
    private keyStore;
    private accountId;
    private config;
    constructor(accountId: string, config?: YouTickConfig, keyStore?: keyStores.KeyStore);
    hasSessionKey(): Promise<boolean>;
    createSessionKey(wallet: any, gasAmount?: string): Promise<void>;
    createSessionKeyMinimal(wallet: any): Promise<void>;
    /**
     * Batch initial setup: Gas deposit + Session Key
     */
    private batchInitialSetup;
    callMethod(method: string, args: any, gas?: string): Promise<any>;
    sendBatchTransaction(actions: any[]): Promise<any>;
}

export { DEFAULT_CONFIG, LitClient, MPCSigner, PKPManager, SessionManager, type YouTickConfig, deriveEthAddress, signWithMPC };
