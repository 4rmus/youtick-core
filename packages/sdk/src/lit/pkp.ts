import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { LitAbility } from "@lit-protocol/constants";
import { LitPKPResource } from "@lit-protocol/auth-helpers";
import { NEAR_AUTH_LIT_ACTION_CODE } from './actions/near-auth';


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
        nearAccountId: string,
        nearPublicKey: string,
        signature: string,
        message: string,
        signer?: any,
        relayApiKey?: string,
        useMock: boolean = true
    ) {
        console.log(`Minting PKP for NEAR Account: ${nearAccountId}`);

        if (useMock || !signer) {
            console.log("Using mock minting (no relay key or signer provided)");
            // Simulate delay
            await new Promise(resolve => setTimeout(resolve, 2000));
            return {
                tokenId: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
                publicKey: "0x0430591451f28b3687eec82601962383842d05713437299a4e216db8a2b5368a5c4cc31d87ee96c5685718df2894b5f884a44b937080b0bb183e2da025686008ab",
                ethAddress: "0x7bd19343d242253818e6922261a861611029c7d4",
                nearImplicitAccount: "30591451f28b3687eec82601962383842d05713437299a4e216db8a2b5368a5c"
            };
        }

        try {
            // Dynamic import to avoid bundling issues if not needed
            const { EthWalletProvider, LitRelay } = await import('@lit-protocol/lit-auth-client');
            const { LitNetwork } = await import('@lit-protocol/constants');

            const authMethod = await EthWalletProvider.authenticate({
                signer,
                litNodeClient: this.litNodeClient,
            });

            if (!relayApiKey) {
                throw new Error("Relay API Key is required for real minting");
            }

            const relay = new LitRelay({
                relayApiKey,
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
            console.error("Real minting failed:", e);
            throw e;
        }
    }

    /**
     * Mint a PKP directly via contracts with Lit Action auth method.
     */
    async mintPKPDirect(
        signer: any,
        litActionIpfsCid: string,
        rpcUrl?: string
    ) {
        try {
            const { LitContracts } = await import('@lit-protocol/contracts-sdk');
            const { LitNetwork } = await import('@lit-protocol/constants');
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

            // Logic to parse logs and find TokenID (Simplified for SDK)
            // Ideally we iterate logs similar to the original file
            let tokenId = "";
            const nftInterface = new ethers5.utils.Interface([
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
                throw new Error("Could not find PKP TokenId in transaction logs");
            }

            const publicKey = await litContracts.pubkeyRouterContract.read.getPubkey(tokenId);
            const ethAddress = ethers5.utils.computeAddress(publicKey);

            return {
                tokenId,
                publicKey,
                ethAddress,
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
    ) {
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
