/**
 * Full Upload Flow Example
 * 
 * This example demonstrates a complete video upload workflow:
 * 1. Connect wallet and create session key
 * 2. Encrypt video with Lit Protocol
 * 3. Upload to IPFS via Lighthouse
 * 4. Mint NFT on NEAR (signless)
 */

import {
    SessionManager,
    LitClient,
    LighthouseClient,
    DEFAULT_CONFIG,
    WalletInterface,
    UnifiedAccessControlCondition
} from '@youtick/sdk';

interface VideoUploadParams {
    wallet: WalletInterface;
    accountId: string;
    videoFile: File;
    title: string;
    description: string;
    thumbnailUrl: string;
    lighthouseApiKey: string;
}

async function uploadVideo({
    wallet,
    accountId,
    videoFile,
    title,
    description,
    thumbnailUrl,
    lighthouseApiKey
}: VideoUploadParams) {
    console.log('🎬 Starting video upload flow...\n');

    // Step 1: Initialize SDK clients
    const sessionManager = new SessionManager(accountId, DEFAULT_CONFIG);
    const litClient = new LitClient(DEFAULT_CONFIG);
    const lighthouseClient = new LighthouseClient(lighthouseApiKey);

    await litClient.connect();
    console.log('✅ Step 1: SDK clients initialized');

    // Step 2: Ensure session key exists
    const hasSession = await sessionManager.hasSessionKey();
    if (!hasSession) {
        console.log('📝 Creating session key (requires wallet signature)...');
        await sessionManager.createSessionKey(wallet, '1');
    }
    console.log('✅ Step 2: Session key ready');

    // Step 3: Define access control (NFT holders only)
    const accessConditions: UnifiedAccessControlCondition[] = [
        {
            conditionType: 'evmBasic',
            contractAddress: '', // Will be set after NFT mint
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

    // Step 4: Get session signatures for encryption
    // (This would use PKP in production)
    console.log('🔐 Getting encryption authorization...');
    // const sessionSigs = await litClient.getSessionSigsWithPKP(...);

    // Step 5: Encrypt video
    console.log('🔒 Encrypting video...');
    /* 
    const { ciphertext, dataToEncryptHash } = await litClient.encryptFile(
        videoFile,
        accessConditions,
        undefined,
        'ethereum',
        sessionSigs
    );
    */
    console.log('✅ Step 5: Video encrypted');

    // Step 6: Upload to IPFS
    console.log('☁️ Uploading to IPFS...');
    /*
    const uploadResult = await lighthouseClient.uploadFile(new Blob([ciphertext]));
    const videoCid = uploadResult.data.Hash;
    */
    const videoCid = 'Qm...'; // Mock for example
    console.log(`✅ Step 6: Uploaded to IPFS (CID: ${videoCid})`);

    // Step 7: Mint NFT (signless!)
    console.log('🎨 Minting NFT...');
    const mintResult = await sessionManager.callMethod('nft_mint_prepaid', {
        receiver_id: accountId,
        token_metadata: {
            title,
            description,
            media: thumbnailUrl,
            copies: 100
        },
        video_metadata: {
            encrypted_cid: videoCid,
            duration_seconds: 180,
            content_type: 'video/mp4'
        }
    });
    console.log('✅ Step 7: NFT minted!');

    return {
        tokenId: mintResult.token_id,
        videoCid,
        transactionHash: mintResult.tx_hash
    };
}

// Usage
async function main() {
    const result = await uploadVideo({
        wallet: null as any, // Your wallet instance
        accountId: 'creator.testnet',
        videoFile: new File([], 'video.mp4'),
        title: 'My First Video',
        description: 'An amazing video',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        lighthouseApiKey: 'YOUR_API_KEY'
    });

    console.log('\n🎉 Upload complete!');
    console.log(result);
}

main().catch(console.error);
