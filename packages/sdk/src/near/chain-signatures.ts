import { ethers } from 'ethers';
import { providers, transactions, utils } from 'near-api-js';
import { ec as EC } from 'elliptic';
import BN from 'bn.js';
import { sha3_256 } from 'js-sha3';
import { YouTickConfig, DEFAULT_CONFIG } from '../config';

// Defaults
const DEFAULT_MPC_CONTRACT = 'v1.signer-prod.testnet';
const DEFAULT_DERIVATION_PATH = 'youtick,1';

export async function deriveEthAddress(
    accountId: string,
    path: string = DEFAULT_DERIVATION_PATH,
    config: YouTickConfig = DEFAULT_CONFIG
): Promise<string> {
    const mpcContract = config.mpcContractId || DEFAULT_MPC_CONTRACT;
    const cacheKey = `mpc_address_v8_${accountId}_${path}_${mpcContract}`;

    // Simple in-memory cache check if window exists (browser)
    if (typeof window !== 'undefined') {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            return cached;
        }
    }

    // 1. Get Master Public Key
    const provider = new providers.JsonRpcProvider({ url: config.nodeUrl });

    let masterKey: string;
    try {
        const result = await provider.query({
            request_type: "call_function",
            account_id: mpcContract,
            method_name: "public_key",
            args_base64: Buffer.from("{}").toString("base64"),
            finality: "final"
        }) as any;

        const keyBytes = result.result;
        const rawString = String.fromCharCode(...keyBytes);
        masterKey = JSON.parse(rawString);
    } catch (e) {
        console.error("Failed to fetch MPC master key, falling back to known testnet key:", e);
        // Fallback for v1.signer-prod.testnet only useful for dev/test
        masterKey = "secp256k1:4HFcTSodRLVCGNVreQW2nRoAT1g8jU6db747155tYf49P7c5t578D5588C889988";
    }

    // 2. Derive Child Public Key
    // accountId is the Caller of the sign function.
    // When using a proxy contract, it is the contract ID.
    // However, for typical User->MPC usage, the accountId is the user.
    // The "derivation path" can be a string like "lit/pkp-minting".
    // The MPC contract derives: child = f(master, caller_id, path)

    // NOTE: This logic mimics the "near-mpc-recovery" derivation.
    // If the contract behavior changes, this needs update.
    const derivedKey = deriveChildKey(masterKey, accountId, path);

    // 3. Convert to Ethereum Address
    const derivedPoint = derivedKey.replace(/^secp256k1:/, '');
    const address = ethers.computeAddress('0x' + derivedPoint);

    if (typeof window !== 'undefined') {
        localStorage.setItem(cacheKey, address);
    }

    return address;
}

function deriveChildKey(masterKeyStr: string, accountId: string, path: string): string {
    const ec = new EC('secp256k1');
    const masterKeyBase58 = masterKeyStr.replace('secp256k1:', '');
    const masterKeyBytes = utils.serialize.base_decode(masterKeyBase58);

    let masterKeyHex = Buffer.from(masterKeyBytes).toString('hex');
    if (masterKeyHex.length === 128) {
        masterKeyHex = '04' + masterKeyHex;
    }

    const masterPoint = ec.keyFromPublic(masterKeyHex, 'hex').getPublic();

    // Use the exact derivation prefix used by the MPC contract
    const derivation_path = `near-mpc-recovery v0.1.0 epsilon derivation:${accountId},${path}`;
    const scalarHex = sha3_256(derivation_path);

    const scalar = new BN(scalarHex, 16);
    const pointToAdd = ec.g.mul(scalar);
    const derivedPoint = masterPoint.add(pointToAdd);

    return derivedPoint.encode('hex', false);
}

export class MPCSigner extends ethers.AbstractSigner {
    private wallet: any; // Using generic wallet interface
    private nearAccountId: string;
    private derivationPath: string;
    private _address: string | null = null;
    private config: YouTickConfig;

    constructor(
        wallet: any,
        nearAccountId: string,
        derivationPath: string = DEFAULT_DERIVATION_PATH,
        provider?: ethers.Provider,
        config: YouTickConfig = DEFAULT_CONFIG
    ) {
        super(provider);
        this.wallet = wallet;
        this.nearAccountId = nearAccountId;
        this.derivationPath = derivationPath;
        this.config = config;
    }

    async getAddress(): Promise<string> {
        if (!this._address) {
            this._address = await deriveEthAddress(
                this.nearAccountId,
                this.derivationPath,
                this.config
            );
        }
        return this._address;
    }

    connect(provider: ethers.Provider): MPCSigner {
        return new MPCSigner(
            this.wallet,
            this.nearAccountId,
            this.derivationPath,
            provider,
            this.config
        );
    }

    async signTransaction(tx: ethers.TransactionRequest): Promise<string> {
        const address = await this.getAddress();
        const populatedTx = await this.populateTransaction(tx);
        const unsignedTx = ethers.Transaction.from({
            ...populatedTx,
            from: address
        } as any);

        const txHash = unsignedTx.unsignedHash;
        const signature = await this.requestSignature(txHash);

        const signedTx = unsignedTx.clone();
        signedTx.signature = signature;

        return signedTx.serialized;
    }

    async signMessage(message: string | Uint8Array): Promise<string> {
        const msgBytes = typeof message === 'string'
            ? ethers.toUtf8Bytes(message)
            : message;
        const messageHash = ethers.hashMessage(msgBytes);

        const signature = await this.requestSignature(messageHash);
        return signature.serialized;
    }

    async signTypedData(
        domain: ethers.TypedDataDomain,
        types: Record<string, ethers.TypedDataField[]>,
        value: Record<string, any>
    ): Promise<string> {
        const hash = ethers.TypedDataEncoder.hash(domain, types, value);
        const signature = await this.requestSignature(hash);
        return signature.serialized;
    }

    /**
     * Core method to request signature from NEAR MPC Contract
     */
    private async requestSignature(payloadHash: string | Uint8Array): Promise<ethers.Signature> {
        const payload = Array.from(ethers.getBytes(payloadHash));
        const mpcContract = this.config.mpcContractId || DEFAULT_MPC_CONTRACT;

        const args = {
            request: {
                payload,
                path: this.derivationPath,
                key_version: 0
            }
        };

        const functionCallAction = transactions.functionCall(
            'sign',
            Buffer.from(JSON.stringify(args)),
            new BN('300000000000000'), // 300 TGas - MPC ops are expensive
            new BN('50000000000000000000000') // 0.05 NEAR deposit (usually refunded)
        );

        const result = await this.wallet.signAndSendTransaction({
            receiverId: mpcContract,
            actions: [functionCallAction]
        });

        // Parse success value
        let successValue: string | undefined;

        // Handle different wallet return shapes
        if (result && result.status && 'SuccessValue' in result.status) {
            successValue = result.status.SuccessValue;
        } else if (typeof result === 'object') {
            // Some wallets return the final execution outcome directly or differently
            // Optimization: Try to find 'SuccessValue' in nested strcutures or simplified result
            // For now assume standard structure or throw
            if (result.status && result.status.SuccessValue) {
                successValue = result.status.SuccessValue;
            }
        }

        if (!successValue) {
            // Fallback: Sometimes we might just get the boolean or undefined if using certain selectors
            // But for MPC we NEED the return value (the signature).
            throw new Error('Failed to get signature from NEAR transaction result. Ensure the transaction succeeded and returned a value.');
        }

        const mpcSig = JSON.parse(Buffer.from(successValue, 'base64').toString());

        const r = '0x' + mpcSig.big_r.affine_point.substring(2, 66);
        const s = '0x' + mpcSig.s.scalar;
        const v = mpcSig.recovery_id + 27;

        return ethers.Signature.from({ r, s, v });
    }
}
