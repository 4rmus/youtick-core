/**
 * Encryption Example
 * 
 * This example demonstrates how to encrypt and decrypt files using
 * Lit Protocol's decentralized access control.
 */

import { LitClient, DEFAULT_CONFIG, UnifiedAccessControlCondition } from '@youtick/sdk';

async function main() {
    // 1. Initialize Lit Client
    const litClient = new LitClient(DEFAULT_CONFIG);
    await litClient.connect();

    console.log('🔐 Connected to Lit Network');
    console.log(`   Network: ${DEFAULT_CONFIG.litNetwork}`);

    // 2. Define Access Control Conditions
    // This example: User must own at least 1 NFT from a contract
    const accessControlConditions: UnifiedAccessControlCondition[] = [
        {
            conditionType: 'evmBasic',
            contractAddress: '0x...',  // Your NFT contract
            standardContractType: 'ERC721',
            chain: 'ethereum',
            method: 'balanceOf',
            parameters: [':userAddress'],
            returnValueTest: {
                key: '',
                comparator: '>=',
                value: '1'
            }
        }
    ];

    // Alternative: NEAR-based access control
    const nearAccessConditions: UnifiedAccessControlCondition[] = [
        {
            conditionType: 'cosmos',
            path: '/cosmos/bank/v1beta1/balances/:userAddress',
            chain: 'near',
            returnValueTest: {
                key: '$.balances[0].amount',
                comparator: '>',
                value: '0'
            }
        }
    ];

    // 3. Encrypt a file
    console.log('\n📦 Encrypting file...');

    const file = new File(['Hello, Web3!'], 'message.txt', { type: 'text/plain' });

    // You need session signatures to encrypt
    // Get these via LitClient.getSessionSigs() or getSessionSigsWithPKP()
    const sessionSigs = null as any; // TODO: await litClient.getSessionSigs(...)

    const { ciphertext, dataToEncryptHash } = await litClient.encryptFile(
        file,
        accessControlConditions,
        undefined, // authSig (optional, use sessionSigs instead)
        'ethereum',
        sessionSigs
    );

    console.log('✅ File encrypted!');
    console.log(`   Ciphertext length: ${ciphertext.length}`);
    console.log(`   Hash: ${dataToEncryptHash}`);

    // 4. Store encrypted content (e.g., on IPFS via Lighthouse)
    // const lighthouseClient = new LighthouseClient(apiKey);
    // const uploadResult = await lighthouseClient.uploadFile(ciphertext);

    // 5. Decrypt the file (user must satisfy access conditions)
    console.log('\n🔓 Decrypting file...');

    const decryptedData = await litClient.decryptFile(
        ciphertext,
        dataToEncryptHash,
        accessControlConditions,
        undefined,
        'ethereum',
        sessionSigs
    );

    const decryptedText = new TextDecoder().decode(decryptedData);
    console.log('✅ File decrypted!');
    console.log(`   Content: ${decryptedText}`);
}

main().catch(console.error);
