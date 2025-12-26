import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { LitAbility } from "@lit-protocol/constants";
import { LitPKPResource } from "@lit-protocol/auth-helpers";
import { NEAR_AUTH_LIT_ACTION_CODE } from './actions/near-auth';
import { PKPMintResult, SessionSigs } from '../types';

export class PKPManager {
    private litNodeClient: LitNodeClient;

    constructor(litNodeClient: LitNodeClient) {
        this.litNodeClient = litNodeClient;
    }

    /**
     * Mint a new PKP for the user using their NEAR account + MPC-derived ETH wallet as Auth Method.
     * Uses Lit Relay Server for gas-free minting.
     */
    async mintPKPWithNear(
        nearAccountId: string, // Kept for logging/context
        nearPublicKey: string, // Unused in direct logic but kept for interface stability
        signature: string, // Deprecated in direct implementation 
        message: string,  // Deprecated usage
        signer?: any,     // Ethers Signer (should be Typed)
        relayApiKey?: string,
        useMock: boolean = false
    ): Promise<PKPMintResult> {
        console.log(`Minting PKP for NEAR Account: ${nearAccountId}`);

        if (useMock) {
            console.warn("Using mock minting - DO NOT USE IN PRODUCTION");
            await new Promise(resolve => setTimeout(resolve, 1000));
            return {
                tokenId: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
                publicKey: "0x0430591451f28b3687eec82601962383842d05713437299a4e216db8a2b5368a5c4cc31d87ee96c5685718df2894b5f884a44b937080b0bb183e2da025686008ab",
                ethAddress: "0x7bd19343d242253818e6922261a861611029c7d4",
                nearImplicitAccount: "30591451f28b3687eec82601962383842d05713437299a4e216db8a2b5368a5c"
            };
        }

        if (!signer) {
            throw new Error("Signer needed for minting");
        }

        try {
            // Dynamic import to avoid bundling issues
            const { EthWalletProvider, LitRelay } = await import('@lit-protocol/lit-auth-client');
            const { LitNetwork } = await import('@lit-protocol/constants');

            const authMethod = await EthWalletProvider.authenticate({
                signer,
                litNodeClient: this.litNodeClient,
            });

            if (!relayApiKey) {
                console.warn("No Relay API Key provided. Minting might fail if wallet has no gas on Lit chain.");
                // We proceed, user/dev might handle gas differently or use self-funded relay
            }

            const relay = new LitRelay({
                relayApiKey: relayApiKey || 'api_key_placeholder', // Fallback
                relayUrl: LitRelay.getRelayUrl(LitNetwork.DatilTest),
            });

            const pkpResult = await relay.mintPKPWithAuthMethods([authMethod], {
                addPkpEthAddressAsPermittedAddress: true,
                sendPkpToitself: true,
            });

            return {
                tokenId: pkpResult.pkpTokenId || "",
                publicKey: pkpResult.pkpPublicKey || "",
                ethAddress: pkpResult.pkpEthAddress || "",
                nearImplicitAccount: nearAccountId
            };
        } catch (e: any) {
            console.error("PKP Minting failed:", e);
            throw new Error(`Failed to mint PKP: ${e.message}`);
        }
    }

    /**
     * Mint a PKP directly via contracts with Lit Action auth method.
     */
    async mintPKPDirect(
        signer: any,
        litActionIpfsCid: string,
        rpcUrl?: string
    ): Promise<PKPMintResult> {
        try {
            const { LitContracts } = await import('@lit-protocol/contracts-sdk');
            const { LitNetwork } = await import('@lit-protocol/constants');
            // Using require/import for Ethers 5 depending on environment (Lit SDK uses Ethers 5)
            // Assuming environment has it or provided
            const ethers5 = await import('ethers5');

            const effectiveRpcUrl = rpcUrl || 'https://yellowstone-rpc.litprotocol.com';

            const litContracts = new LitContracts({
                signer,
                network: LitNetwork.DatilTest,
                rpc: effectiveRpcUrl,
                debug: false
            }) as any;

            await litContracts.connect();

            // Get mint cost
            const mintCost = await litContracts.pkpNftContract.read.mintCost();

            // Auth method configuration for Lit Action (IPFS CID)
            const authMethodType = 2; // LitAction
            const authMethodId = litContracts.utils.getBytesFromMultihash(litActionIpfsCid);
            const authMethodPubkey = "0x";

            // mintNextAndAddAuthMethods
            const tx = await litContracts.pkpHelperContract.write.mintNextAndAddAuthMethods(
                2, // keyType: ECDSA
                [authMethodType],
                [authMethodId],
                [authMethodPubkey],
                [[1, 2, 17]], // SignAnything + PersonalSign + GrantDecrypt
                true, // addPkpEthAddressAsPermittedAddress
                true, // sendPkpToItself
                { value: mintCost }
            );

            const receipt = await tx.wait();

            let tokenId = "";
            const nftInterface = new ethers5.default.utils.Interface([
                "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
            ]);

            for (const log of receipt.logs) {
                try {
                    const parsed = nftInterface.parseLog(log as any);
                    if (parsed && parsed.name === 'Transfer' && parsed.args.from === ethers5.constants.AddressZero) {
                        tokenId = parsed.args.tokenId.toString();
                    }
                } catch (e) { /* ignore */ }
            }

            if (!tokenId) {
                // Try simpler lookup
                const topics = receipt.logs[0].topics;
                // Sometimes it's hard to parse generically without ABI, assuming failure if not found
                throw new Error("Could not find PKP TokenId in transaction logs");
            }

            const publicKey = await litContracts.pubkeyRouterContract.read.getPubkey(tokenId);
            const ethAddress = ethers5.default.utils.computeAddress(publicKey);

            return {
                tokenId,
                publicKey,
                ethAddress,
                nearImplicitAccount: "",
                txHash: receipt.transactionHash
            };
        } catch (e: any) {
            console.error("Minting with auth method failed:", e);
            throw e;
        }
    }

    async getPKPSessionSigs(
        pkpPublicKey: string,
        nearSignCallback: () => Promise<{ sig: string, msg: string, pk: string }>
    ): Promise<SessionSigs> {
        const { sig, msg, pk } = await nearSignCallback();

        return this.litNodeClient.getPkpSessionSigs({
            pkpPublicKey,
            authMethods: [
                {
                    authMethodType: 99999, // Custom Auth Type ID
                    accessToken: JSON.stringify({ sig, msg, pk }),
                }
            ],
            resourceAbilityRequests: [
                {
                    resource: new LitPKPResource('*'),
                    ability: LitAbility.PKPSigning
                }
            ],
            litActionCode: NEAR_AUTH_LIT_ACTION_CODE,
            jsParams: {
                publicKey: pk,
                sig: sig,
                message: msg
            }
        });
    }
}
