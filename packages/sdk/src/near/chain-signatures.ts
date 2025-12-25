import { ethers } from 'ethers';
import { providers, transactions, utils } from 'near-api-js';
import { ec as EC } from 'elliptic';
import BN from 'bn.js';
import { sha3_256 } from 'js-sha3';
import { YouTickConfig, DEFAULT_CONFIG } from '../config';

const MPC_CONTRACT = 'v1.signer-prod.testnet';

export async function deriveEthAddress(
    accountId: string,
    path: string,
    config: YouTickConfig = DEFAULT_CONFIG
): Promise<string> {
    const cacheKey = `mpc_address_v8_${accountId}_${path}`;

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
            account_id: MPC_CONTRACT,
            method_name: "public_key",
            args_base64: Buffer.from("{}").toString("base64"),
            finality: "final"
        }) as any;

        const keyBytes = result.result;
        const rawString = String.fromCharCode(...keyBytes);
        masterKey = JSON.parse(rawString);
    } catch (e) {
        console.error("Failed to fetch MPC master key:", e);
        masterKey = "secp256k1:4HFcTSodRLVCGNVreQW2nRoAT1g8jU6db747155tYf49P7c5t578D5588C889988";
    }

    // 2. Derive Child Public Key
    // accountId is the Caller of the sign function.
    // When using a proxy contract, it is the contract ID.
    const effectiveCallerId = config.contractId;
    const compositePath = `${effectiveCallerId}/${path}`;

    const derivedKey = deriveChildKey(masterKey, effectiveCallerId, compositePath);

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
    const derivation_path = `near-mpc-recovery v0.1.0 epsilon derivation:${accountId},${path}`;
    const scalarHex = sha3_256(derivation_path);

    const scalar = new BN(scalarHex, 16);
    const pointToAdd = ec.g.mul(scalar);
    const derivedPoint = masterPoint.add(pointToAdd);

    return derivedPoint.encode('hex', false);
}

export async function signWithMPC(
    wallet: any,
    accountId: string,
    path: string,
    message: string,
    config?: YouTickConfig
): Promise<any> {
    const messageHash = ethers.hashMessage(message);
    const payload = Array.from(ethers.getBytes(messageHash));

    const args = {
        request: {
            payload,
            path,
            key_version: 0
        }
    };

    const functionCallAction = transactions.functionCall(
        'sign',
        Buffer.from(JSON.stringify(args)),
        new BN('300000000000000'), // 300 TGas
        new BN('100000000000000000000000') // 0.1 NEAR
    );

    const result = await wallet.signAndSendTransaction({
        receiverId: MPC_CONTRACT,
        actions: [functionCallAction as any]
    });

    const successValue = result.status.SuccessValue;
    if (!successValue) {
        throw new Error('Failed to get signature from transaction result');
    }

    return JSON.parse(Buffer.from(successValue, 'base64').toString());
}

export class MPCSigner extends ethers.AbstractSigner {
    private wallet: any;
    private nearAccountId: string;
    private derivationPath: string;
    private _address: string | null = null;
    private config: YouTickConfig;

    constructor(
        wallet: any,
        nearAccountId: string,
        derivationPath: string = 'lit/pkp-minting',
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
            this._address = await deriveEthAddress(this.nearAccountId, this.derivationPath, this.config);
        }
        return this._address;
    }

    connect(provider: ethers.Provider): MPCSigner {
        return new MPCSigner(this.wallet, this.nearAccountId, this.derivationPath, provider, this.config);
    }

    async signTransaction(tx: ethers.TransactionRequest): Promise<string> {
        const address = await this.getAddress();
        const populatedTx = await this.populateTransaction(tx);
        const unsignedTx = ethers.Transaction.from({
            ...populatedTx,
            from: address
        } as any);

        const txHash = unsignedTx.unsignedHash;
        const payload = Array.from(ethers.getBytes(txHash));

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
            new BN('300000000000000'), // 300 TGas
            new BN('100000000000000000000000') // 0.1 NEAR
        );

        const result = await this.wallet.signAndSendTransaction({
            receiverId: MPC_CONTRACT,
            actions: [functionCallAction as any]
        });

        const successValue = result.status.SuccessValue;
        if (!successValue) {
            throw new Error('MPC signing failed');
        }

        const mpcSig = JSON.parse(Buffer.from(successValue, 'base64').toString());
        const r = '0x' + mpcSig.big_r.affine_point.substring(2, 66);
        const s = '0x' + mpcSig.s.scalar;
        const v = mpcSig.recovery_id + 27;

        const signedTx = unsignedTx.clone();
        signedTx.signature = ethers.Signature.from({ r, s, v });

        return signedTx.serialized;
    }

    async signMessage(message: string | Uint8Array): Promise<string> {
        const msgBytes = typeof message === 'string'
            ? ethers.toUtf8Bytes(message)
            : message;
        const messageHash = ethers.hashMessage(msgBytes);
        const payload = Array.from(ethers.getBytes(messageHash));

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
            new BN('300000000000000'), // 300 TGas
            new BN('100000000000000000000000') // 0.1 NEAR
        );

        const result = await this.wallet.signAndSendTransaction({
            receiverId: MPC_CONTRACT,
            actions: [functionCallAction as any]
        });

        const successValue = result.status.SuccessValue;
        if (!successValue) {
            throw new Error('MPC message signing failed');
        }

        const mpcSig = JSON.parse(Buffer.from(successValue, 'base64').toString());
        const r = '0x' + mpcSig.big_r.affine_point.substring(2, 66);
        const s = '0x' + mpcSig.s.scalar;
        const v = mpcSig.recovery_id + 27;

        return ethers.Signature.from({ r, s, v }).serialized;
    }

    async signTypedData(
        domain: ethers.TypedDataDomain,
        types: Record<string, ethers.TypedDataField[]>,
        value: Record<string, any>
    ): Promise<string> {
        const hash = ethers.TypedDataEncoder.hash(domain, types, value);
        const payload = Array.from(ethers.getBytes(hash));

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
            new BN('300000000000000'), // 300 TGas
            new BN('100000000000000000000000') // 0.1 NEAR
        );

        const result = await this.wallet.signAndSendTransaction({
            receiverId: MPC_CONTRACT,
            actions: [functionCallAction as any]
        });

        const successValue = result.status.SuccessValue;
        if (!successValue) {
            throw new Error('MPC typed data signing failed');
        }

        const mpcSig = JSON.parse(Buffer.from(successValue, 'base64').toString());
        const r = '0x' + mpcSig.big_r.affine_point.substring(2, 66);
        const s = '0x' + mpcSig.s.scalar;
        const v = mpcSig.recovery_id + 27;

        return ethers.Signature.from({ r, s, v }).serialized;
    }
}
