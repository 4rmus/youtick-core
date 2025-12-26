import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { LitAbility } from "@lit-protocol/constants";
import { encryptFile, decryptToFile } from "@lit-protocol/encryption";
import {
    createSiweMessageWithRecaps,
    LitAccessControlConditionResource,
    LitPKPResource,
    LitActionResource
} from "@lit-protocol/auth-helpers";
import { YouTickConfig, DEFAULT_CONFIG } from '../config';
import { StorageInterface, MemoryStorage, SessionSigs, AuthSig, UnifiedAccessControlCondition } from '../types';
import { ethers } from 'ethers';

export class LitClient {
    private litNodeClient: LitNodeClient;
    private config: YouTickConfig;
    private storage: StorageInterface;

    constructor(config: YouTickConfig = DEFAULT_CONFIG, storage?: StorageInterface) {
        this.config = config;
        this.storage = storage || (typeof window !== 'undefined' ? localStorage : new MemoryStorage());

        this.litNodeClient = new LitNodeClient({
            litNetwork: this.config.litNetwork,
            debug: false,
            rpcUrl: this.config.rpcUrl
        });
    }

    async connect(): Promise<void> {
        if (!this.litNodeClient.ready) {
            await this.litNodeClient.connect();
        }
    }

    async getSessionSigs(
        wallet: any,
        accountId: string,
        ethAddress: string,
        signWithMPC: (wallet: any, accountId: string, path: string, message: string) => Promise<any>,
        derivationPath: string = "lit/pkp-minting"
    ): Promise<SessionSigs> {
        await this.connect();

        // Check cache logic here if needed (skipping for now as per web app "disabled cache" comment)

        const resource = new LitAccessControlConditionResource('*');

        const sessionSigs = await this.litNodeClient.getSessionSigs({
            chain: 'ethereum',
            expiration: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(), // 24 hours
            resourceAbilityRequests: [
                {
                    resource: resource,
                    ability: LitAbility.AccessControlConditionDecryption,
                },
                {
                    resource: resource,
                    ability: LitAbility.AccessControlConditionSigning,
                },
            ],
            authNeededCallback: async ({ resourceAbilityRequests, expiration, uri }) => {
                if (!uri || !expiration || !resourceAbilityRequests) {
                    throw new Error("Missing required fields in authNeededCallback");
                }

                if (!ethAddress) {
                    throw new Error("ethAddress is required");
                }

                const toSign = await createSiweMessageWithRecaps({
                    uri,
                    expiration,
                    resources: resourceAbilityRequests,
                    walletAddress: ethAddress,
                    nonce: await this.litNodeClient.getLatestBlockhash(),
                    litNodeClient: this.litNodeClient,
                });

                // Sign with MPC
                const mpcSignature = await signWithMPC(wallet, accountId, derivationPath, toSign);

                const r_val = '0x' + mpcSignature.big_r.affine_point.substring(2, 66);
                const s_val = '0x' + mpcSignature.s.scalar;
                let v_val = 27;
                if (typeof mpcSignature.recovery_id === 'number') {
                    v_val = mpcSignature.recovery_id + 27;
                }
                const signature = ethers.Signature.from({ r: r_val, s: s_val, v: v_val }).serialized;

                // Verify and v-flip if necessary
                let recoveredAddr = ethers.verifyMessage(toSign, signature);
                let validSignature = signature;

                if (recoveredAddr.toLowerCase() !== ethAddress.toLowerCase()) {
                    const flippedV = v_val === 27 ? 28 : 27;
                    const flippedSignature = ethers.Signature.from({ r: r_val, s: s_val, v: flippedV }).serialized;
                    const recoveredFlipped = ethers.verifyMessage(toSign, flippedSignature);

                    if (recoveredFlipped.toLowerCase() === ethAddress.toLowerCase()) {
                        recoveredAddr = recoveredFlipped;
                        validSignature = flippedSignature;
                    }
                }

                return {
                    sig: validSignature,
                    derivedVia: "web3.eth.personal.sign",
                    signedMessage: toSign,
                    address: ethAddress,
                };
            },
        });

        return sessionSigs;
    }

    /**
     * Get session signatures using a PKP (signless experience).
     * Uses Lit Action to verify NEAR signature and authorize the PKP.
     */
    async getSessionSigsWithPKP(
        pkpPublicKey: string,
        pkpEthAddress: string,
        nearAccountId: string,
        capacityDelegationAuthSig?: AuthSig
    ): Promise<SessionSigs> {
        await this.connect();

        const litActionIpfsCid = this.config.litActionIpfsId || "QmZhqF9xZAJTTRyUR4d5L1zt83MByXaXUQuaU3a7gKdsh6";

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
        accessControlConditions: UnifiedAccessControlCondition[],
        authSig?: AuthSig,
        chain: string = 'ethereum',
        sessionSigs?: SessionSigs
    ): Promise<{ ciphertext: string; dataToEncryptHash: string }> {
        await this.connect();

        const params: any = {
            file,
            chain,
            unifiedAccessControlConditions: accessControlConditions
        };

        if (sessionSigs) {
            params.sessionSigs = sessionSigs;
        } else if (authSig) {
            params.authSig = authSig;
        } else {
            throw new Error("Either authSig or sessionSigs must be provided for encryption");
        }

        return await encryptFile(params, this.litNodeClient);
    }

    async decryptFile(
        ciphertext: string,
        dataToEncryptHash: string,
        accessControlConditions: UnifiedAccessControlCondition[],
        authSig?: AuthSig,
        chain: string = 'ethereum',
        sessionSigs?: SessionSigs
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
        } else if (authSig) {
            params.authSig = authSig;
        } else {
            throw new Error("Either authSig or sessionSigs must be provided for decryption");
        }

        return await decryptToFile(params, this.litNodeClient);
    }

    get client(): LitNodeClient {
        return this.litNodeClient;
    }
}
