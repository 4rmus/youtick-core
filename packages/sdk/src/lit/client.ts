import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { LitAbility } from "@lit-protocol/constants";
import { encryptFile, decryptToFile } from "@lit-protocol/encryption";
import { createSiweMessageWithRecaps, LitAccessControlConditionResource, LitPKPResource, LitActionResource } from "@lit-protocol/auth-helpers";
import { ethers } from "ethers";
import { YouTickConfig, DEFAULT_CONFIG } from '../config';
import { StorageInterface, MemoryStorage } from '../types';

export class LitClient {
    private litNodeClient: LitNodeClient;
    private config: YouTickConfig;
    private storage: StorageInterface;
    private SESSION_CACHE_KEY = 'lit_session_sigs';

    constructor(config: YouTickConfig = DEFAULT_CONFIG, storage?: StorageInterface) {
        this.config = config;
        this.storage = storage || (typeof window !== 'undefined' ? localStorage : new MemoryStorage());

        this.litNodeClient = new LitNodeClient({
            litNetwork: this.config.litNetwork,
            debug: false,
            rpcUrl: this.config.rpcUrl
        });
    }

    async connect() {
        if (!this.litNodeClient.ready) {
            await this.litNodeClient.connect();
        }
    }

    /**
     * Get session signatures using a PKP (signless experience).
     * Uses Lit Action to verify NEAR signature and authorize the PKP.
     */
    async getSessionSigsWithPKP(
        pkpPublicKey: string,
        pkpEthAddress: string,
        nearAccountId: string,
        // Optional capacity delegation sig
        capacityDelegationAuthSig?: any
    ) {
        await this.connect();

        // Use IPFS CID of Lit Action - MUST match the CID registered as auth method during PKP minting
        const litActionIpfsCid = this.config.litActionIpfsId || "Qmc6cLer2fmtuzNFhdtBoZvM1gCzX9s8gbc8wzWdizeuJe";

        // Build session sig params
        const sessionParams: any = {
            pkpPublicKey,
            litActionIpfsId: litActionIpfsCid,
            jsParams: {
                pkpPublicKey: pkpPublicKey
            },
            resourceAbilityRequests: [
                {
                    resource: new LitAccessControlConditionResource('*'),
                    ability: LitAbility.AccessControlConditionDecryption
                },
                {
                    resource: new LitPKPResource('*'),
                    ability: LitAbility.PKPSigning
                },
                {
                    resource: new LitActionResource('*'),
                    ability: LitAbility.LitActionExecution
                }
            ],
            expiration: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(), // 24 hours
        };

        if (capacityDelegationAuthSig) {
            sessionParams.capabilityAuthSigs = [capacityDelegationAuthSig];
        }

        const sessionSigs = await this.litNodeClient.getLitActionSessionSigs(sessionParams);
        return sessionSigs;
    }

    async encryptFile(
        file: File | Blob,
        accessControlConditions: any[],
        authSig?: any,
        chain: string = 'ethereum',
        sessionSigs?: any
    ) {
        await this.connect();

        const params: any = {
            file,
            chain,
            unifiedAccessControlConditions: accessControlConditions
        };

        if (sessionSigs) {
            params.sessionSigs = sessionSigs;
        } else {
            params.authSig = authSig;
        }

        return await encryptFile(params, this.litNodeClient);
    }

    async decryptFile(
        ciphertext: string,
        dataToEncryptHash: string,
        accessControlConditions: any[],
        authSig?: any,
        chain: string = 'ethereum',
        sessionSigs?: any
    ): Promise<Uint8Array> {
        await this.connect();

        const params: any = {
            ciphertext,
            dataToEncryptHash,
            chain,
            unifiedAccessControlConditions: accessControlConditions
        };

        if (sessionSigs) {
            params.sessionSigs = sessionSigs;
        } else {
            params.authSig = authSig;
        }

        return await decryptToFile(params, this.litNodeClient);
    }
}
