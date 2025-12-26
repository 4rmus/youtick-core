import { KeyPair, Account } from 'near-api-js';
import { LitNodeClient } from '@lit-protocol/lit-node-client';
import * as _lighthouse_web3_sdk_dist_Lighthouse_encryption_getAuthMessage from '@lighthouse-web3/sdk/dist/Lighthouse/encryption/getAuthMessage';
import * as _lighthouse_web3_sdk_dist_Lighthouse_encryption_applyAccessCondition from '@lighthouse-web3/sdk/dist/Lighthouse/encryption/applyAccessCondition';
import * as _lighthouse_web3_sdk_dist_types from '@lighthouse-web3/sdk/dist/types';
import * as _near_js_types from '@near-js/types';

interface YouTickConfig {
    networkId: string;
    contractId: string;
    nodeUrl: string;
    litNetwork: "datil-dev" | "datil-test" | "datil";
    litActionIpfsId?: string;
    mpcContractId?: string;
    rpcUrl?: string;
}
declare const DEFAULT_CONFIG: YouTickConfig;

interface StorageInterface {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}
declare class MemoryStorage implements StorageInterface {
    private storage;
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}
interface AuthSig {
    sig: string;
    derivedVia: string;
    signedMessage: string;
    address: string;
}
interface SessionSigs {
    [key: string]: AuthSig;
}
interface AccessControlCondition {
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
interface UnifiedAccessControlCondition {
    conditionType?: string;
    returnValueTest?: {
        key: string;
        comparator: string;
        value: string;
    };
    [key: string]: any;
}
interface PKPMintResult {
    tokenId: string;
    publicKey: string;
    ethAddress: string;
    nearImplicitAccount: string;
    txHash?: string;
}
interface NearSessionKey {
    publicKey: string;
    secretKey: string;
}
interface NearTransactionConfig {
    receiverId: string;
    actions: any[];
}
interface WalletInterface {
    signAndSendTransaction(params: NearTransactionConfig): Promise<any>;
    signAndSendTransactions(params: {
        transactions: NearTransactionConfig[];
    }): Promise<any>;
    getAccounts(): Promise<Array<{
        accountId: string;
    }>>;
}

declare class SessionManager {
    private keyStore;
    accountId: string;
    private config;
    constructor(accountId: string, config?: YouTickConfig, keyStore?: any);
    hasSessionKey(): Promise<boolean>;
    createSessionKey(wallet: WalletInterface, gasAmount?: string): Promise<void>;
    /**
     * Create session key with minimal deposit (for PKP users)
     * PKP users need less gas but still need prepaid for MPC + NFT minting
     */
    createSessionKeyMinimal(wallet: WalletInterface): Promise<void>;
    saveSessionKey(keyPair: KeyPair): Promise<void>;
    callMethod(method: string, args: any, gas?: string): Promise<any>;
    sendBatchTransaction(actions: any[]): Promise<any>;
    getAccountBalance(nodeUrl?: string): Promise<number>;
    hasSufficientGas(nodeUrl?: string, minAmount?: number): Promise<boolean>;
    ensureGas(wallet: WalletInterface, nodeUrl?: string, minAmount?: number): Promise<void>;
    topUpGas(wallet: WalletInterface, amount: string): Promise<void>;
    withdrawFunds(wallet: WalletInterface, amount: string): Promise<void>;
    withdrawFundsSilent(amount: string): Promise<any>;
    viewMethod(method: string, args?: any): Promise<any>;
    logout(): Promise<void>;
}

declare class LitClient {
    private litNodeClient;
    private config;
    private storage;
    constructor(config?: YouTickConfig, storage?: StorageInterface);
    connect(): Promise<void>;
    getSessionSigs(wallet: any, accountId: string, ethAddress: string, signWithMPC: (wallet: any, accountId: string, path: string, message: string) => Promise<any>, derivationPath?: string): Promise<SessionSigs>;
    /**
     * Get session signatures using a PKP (signless experience).
     * Uses Lit Action to verify NEAR signature and authorize the PKP.
     */
    getSessionSigsWithPKP(pkpPublicKey: string, pkpEthAddress: string, nearAccountId: string, capacityDelegationAuthSig?: AuthSig): Promise<SessionSigs>;
    encryptFile(file: File | Blob, accessControlConditions: UnifiedAccessControlCondition[], authSig?: AuthSig, chain?: string, sessionSigs?: SessionSigs): Promise<{
        ciphertext: string;
        dataToEncryptHash: string;
    }>;
    decryptFile(ciphertext: string, dataToEncryptHash: string, accessControlConditions: UnifiedAccessControlCondition[], authSig?: AuthSig, chain?: string, sessionSigs?: SessionSigs): Promise<Uint8Array>;
    get client(): LitNodeClient;
}

type lit_LitClient = LitClient;
declare const lit_LitClient: typeof LitClient;
declare namespace lit {
  export { lit_LitClient as LitClient };
}

declare class LighthouseClient {
    private apiKey;
    constructor(apiKey: string);
    /**
     * Upload file to Lighthouse
     * Uses direct API call for browser compatibility
     */
    uploadFile(file: File | FileList | any): Promise<{
        data: any;
    }>;
    /**
     * Upload encrypted file to Lighthouse
     */
    uploadEncryptedFile(file: File | any, publicKey: string, signedMessage: string, uploadProgressCallback?: (data: any) => void): Promise<{
        data: _lighthouse_web3_sdk_dist_types.IFileUploadedResponse[];
    }>;
    /**
     * Apply access conditions to encrypted file
     */
    applyAccessConditions(cid: string, conditions: any[], publicKey: string, signedMessage: string, aggregator?: string, chainType?: string): Promise<_lighthouse_web3_sdk_dist_Lighthouse_encryption_applyAccessCondition.accessControlResponse>;
    getAuthMessage(publicKey: string): Promise<_lighthouse_web3_sdk_dist_Lighthouse_encryption_getAuthMessage.authMessageResponse>;
}

declare class YoutickClient {
    session: SessionManager;
    lit: LitClient;
    lighthouse: LighthouseClient;
    config: YouTickConfig;
    constructor(accountId: string, lighthouseApiKey?: string, // Optional if using proxy
    config?: YouTickConfig);
    /**
     * Publish a video: Encrypt -> Upload -> Mint
     * @param file Video file to upload
     * @param metadata Title, price, description
     */
    publishVideo(file: File, metadata: {
        title: string;
        description: string;
        price: string;
        thumbnailCid?: string;
    }): Promise<{
        tokenId: `${string}-${string}-${string}-${string}-${string}`;
        cid: any;
    }>;
}

interface VideoMetadata {
    encrypted_cid: string;
    livepeer_playback_id: string;
    duration_seconds: number;
    content_type: 'Concert' | 'Cinema' | 'Exclusive' | 'LiveEvent';
    event_date?: number;
}
interface EventMetadata {
    encrypted_cid: string;
    title: string;
    description: string;
    price: string;
    livepeer_playback_id?: string;
}
declare class YouTickContract {
    private contractId;
    private account;
    constructor(account: Account, contractId?: string);
    createEvent(event: EventMetadata, storageDeposit?: string): Promise<_near_js_types.FinalExecutionOutcome>;
    createEventPrepaid(event: EventMetadata): Promise<_near_js_types.FinalExecutionOutcome>;
    buyTicket(encryptedCid: string, priceCushion: string | undefined, attachedDeposit: string): Promise<_near_js_types.FinalExecutionOutcome>;
    buyTicketPrepaid(encryptedCid: string): Promise<_near_js_types.FinalExecutionOutcome>;
    /**
     * Request MPC signature via Proxy
     */
    signWithMPC(payload: number[], path: string, keyVersion?: number): Promise<_near_js_types.FinalExecutionOutcome>;
    getEvents(fromIndex?: number, limit?: number): Promise<any[]>;
    getTokenWithVideo(accountId: string): Promise<any[]>;
}

type youtick_EventMetadata = EventMetadata;
type youtick_VideoMetadata = VideoMetadata;
type youtick_YouTickContract = YouTickContract;
declare const youtick_YouTickContract: typeof YouTickContract;
declare namespace youtick {
  export { type youtick_EventMetadata as EventMetadata, type youtick_VideoMetadata as VideoMetadata, youtick_YouTickContract as YouTickContract };
}

declare function deriveEthAddress(accountId: string, path?: string, config?: YouTickConfig): Promise<string>;

/**
 * Batch multiple actions into a single transaction
 * This reduces multiple signatures into one
 */
declare function batchUploadActions(wallet: WalletInterface, contractId: string, accountId: string, videoMetadata: {
    receiver_id: string;
    token_metadata: {
        title: string;
        description: string;
        media: string;
        copies: number;
    };
    video_metadata: {
        encrypted_cid: string;
        duration_seconds: number;
        content_type: string;
    };
}, eventMetadata: {
    encrypted_cid: string;
    title: string;
    description: string;
    price: string;
}): Promise<any>;
/**
 * Batch initial setup: Gas deposit + Session Key
 * This requires TWO transactions because:
 * 1. deposit_funds goes to the CONTRACT
 * 2. addKey goes to the USER's account
 */
declare function batchInitialSetup(wallet: WalletInterface, accountId: string, contractId: string, sessionKeyPublicKey: string, gasAmount?: string): Promise<any>;
/**
 * Signless version of batchUploadActions
 * Uses Session Key and internal balance
 */
declare function batchUploadActionsSignless(sessionManager: any, videoMetadata: {
    receiver_id: string;
    token_metadata: {
        title: string;
        description: string;
        media: string;
        copies: number;
    };
    video_metadata: {
        encrypted_cid: string;
        duration_seconds: number;
        content_type: string;
    };
}, eventMetadata: {
    encrypted_cid: string;
    title: string;
    description: string;
    price: string;
}): Promise<any>;
/**
 * Create session key only (no deposit) for PKP users
 * PKP users don't need prepaid gas - they pay directly
 */
declare function createSessionKeyOnly(wallet: WalletInterface, accountId: string, contractId: string, sessionKeyPublicKey: string): Promise<any>;

export { type AccessControlCondition, type AuthSig, DEFAULT_CONFIG, type EventMetadata, LighthouseClient, lit as Lit, LitClient, MemoryStorage, youtick as Near, type NearSessionKey, type NearTransactionConfig, type PKPMintResult, SessionManager, type SessionSigs, type StorageInterface, type UnifiedAccessControlCondition, type VideoMetadata, type WalletInterface, type YouTickConfig, YouTickContract, YoutickClient, batchInitialSetup, batchUploadActions, batchUploadActionsSignless, createSessionKeyOnly, deriveEthAddress };
