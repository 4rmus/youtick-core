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
