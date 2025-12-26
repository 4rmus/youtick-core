import { SessionManager } from '../auth/session';
import { LitClient } from '../encryption/lit';
import { LighthouseClient } from '../storage/lighthouse';
import { YouTickConfig, DEFAULT_CONFIG } from '../config';
import { batchUploadActionsSignless } from '../utils/batch-transactions';
import { deriveEthAddress } from '../utils/mpc';
import { ethers } from 'ethers';
import { utils } from 'near-api-js';

export class YoutickClient {
    public session: SessionManager;
    public lit: LitClient;
    public lighthouse: LighthouseClient;
    public config: YouTickConfig;

    constructor(
        accountId: string,
        lighthouseApiKey: string = "", // Optional if using proxy
        config: YouTickConfig = DEFAULT_CONFIG,
    ) {
        this.config = config;
        this.session = new SessionManager(accountId, config);
        this.lit = new LitClient(config);
        this.lighthouse = new LighthouseClient(lighthouseApiKey);
    }

    /**
     * Publish a video: Encrypt -> Upload -> Mint
     * @param file Video file to upload
     * @param metadata Title, price, description
     */
    async publishVideo(
        file: File,
        metadata: { title: string; description: string; price: string; thumbnailCid?: string }
    ) {
        // 0. Ensure Session
        const hasSession = await this.session.hasSessionKey();
        if (!hasSession) {
            throw new Error("Session key not found. Please create one first.");
        }

        // 1. Get MPC Address & Derive Logic
        const derivationPath = 'lit/pkp-minting';
        const ethAddress = await deriveEthAddress(this.config.contractId, derivationPath); // Caller is contractId in this simplified derivation? 
        // Note: Check mpc.ts deriveEthAddress params. Caller usually is user unless via proxy.
        // In UploadForm: `deriveEthAddress(CONTRACT_ID, derivationPath)` -> The caller passed to derivation is CONTRACT_ID?
        // Wait, `deriveEthAddress` takes `accountId`. UploadForm passes `CONTRACT_ID`. 
        // Yes, because the MPC key is "owned" by the contract (or derived relative to it) so the user can claim it?
        // Actually, for Session Keys, the User is the caller of `sign`. 
        // If the contract calls `sign`, the caller is the contract.
        // `sessionManager.callMethod('sign_with_mpc')` -> The contract executes `sign`. 
        // So the `caller_id` seen by MPC node is the `CONTRACT_ID`.
        // So `deriveEthAddress(CONTRACT_ID, ...)` is correct.

        // 2. Encrypt with Lit
        const videoUuid = crypto.randomUUID();
        const accessControlConditions = [
            {
                conditionType: 'evmBasic',
                contractAddress: '',
                standardContractType: '',
                chain: 'ethereum',
                method: 'eth_getBalance',
                parameters: [':userAddress', 'latest'],
                returnValueTest: {
                    key: '',
                    comparator: '>=',
                    value: '0'
                }
            }
        ];

        // MPC Signer Callback
        const signWithMPC = async (w: any, accId: string, path: string, msg: string) => {
            const messageHash = ethers.hashMessage(msg);
            const payload = Array.from(ethers.getBytes(messageHash));

            // Calls contract via Session Key (prepaid)
            return await this.session.callMethod('sign_with_mpc', {
                payload,
                path,
                key_version: 0
            });
        };

        // Get Session Sigs
        const sessionSigs = await this.lit.getSessionSigs(
            null, // wallet not needed for session key call
            this.session['accountId'], // Accessing private property using key or getter if available? User ID.
            ethAddress,
            signWithMPC,
            derivationPath
        );

        // Encrypt
        const { ciphertext, dataToEncryptHash } = await this.lit.encryptFile(
            file,
            accessControlConditions,
            undefined,
            'ethereum',
            sessionSigs
        );

        // 3. Upload enc + metadata
        const encryptedContent = {
            ciphertext,
            dataToEncryptHash,
            accessControlConditions
        };

        const metadataBlob = new Blob([JSON.stringify(encryptedContent)], { type: 'application/json' });
        const encryptedFile = new File([metadataBlob], file.name + ".json", { type: "application/json" });

        const uploadResponse = await this.lighthouse.uploadFile(encryptedFile);
        const fileHash = (uploadResponse.data as any).Hash || (Array.isArray(uploadResponse.data) ? uploadResponse.data[0].Hash : null);

        if (!fileHash) throw new Error("Upload failed, no hash returned");

        // 4. Batch Contract Call (Mint)
        const eventTitle = `${fileHash}:::${metadata.thumbnailCid || ''}:::${metadata.title}`;
        const mediaUrl = `https://gateway.lighthouse.storage/ipfs/${metadata.thumbnailCid || ''}`;

        const videoMetadata = {
            receiver_id: this.session['accountId'],
            token_metadata: {
                title: eventTitle,
                description: metadata.description,
                media: mediaUrl,
                copies: 1
            },
            video_metadata: {
                encrypted_cid: videoUuid,
                livepeer_playback_id: '',
                duration_seconds: 0,
                content_type: 'Exclusive'
            }
        };

        const eventMetadata = {
            encrypted_cid: videoUuid,
            title: eventTitle,
            description: metadata.description,
            price: utils.format.parseNearAmount(metadata.price) || '0',
            livepeer_playback_id: ''
        };

        await batchUploadActionsSignless(
            this.session,
            videoMetadata as any,
            eventMetadata
        );

        return {
            tokenId: videoUuid, // TODO: Get actual token ID from event?
            cid: fileHash
        };
    }
}
