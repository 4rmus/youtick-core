/**
 * Configuration interface for the YouTick SDK.
 */
export interface YouTickConfig {
    /** NEAR network ID ('testnet' or 'mainnet') */
    networkId: string;
    /** The YouTick smart contract account ID */
    contractId: string;
    /** NEAR RPC endpoint URL */
    nodeUrl: string;
    /** Lit Protocol network to use */
    litNetwork: "datil-dev" | "datil-test" | "datil";
    /** Optional: IPFS CID for a custom Lit Action */
    litActionIpfsId?: string;
    /** Optional: NEAR MPC Contract ID for chain signatures */
    mpcContractId?: string;
    /** Optional: Custom RPC for Lit or NEAR proxy */
    rpcUrl?: string;
}

/**
 * Pre-configured settings for NEAR Testnet.
 */
export const TESTNET_CONFIG: YouTickConfig = {
    networkId: 'testnet',
    contractId: 'sdk-1-0.utick.testnet',
    nodeUrl: 'https://rpc.testnet.fastnear.com',
    litNetwork: 'datil-test',
    mpcContractId: 'v1.signer-prod.testnet'
};

/**
 * Pre-configured settings for NEAR Mainnet.
 * @warning Ensure you use a production-ready contract ID before going live.
 */
export const MAINNET_CONFIG: YouTickConfig = {
    networkId: 'mainnet',
    contractId: 'prod.youtick.near',
    nodeUrl: 'https://rpc.mainnet.near.org',
    litNetwork: 'datil',
    mpcContractId: 'signer.canhazgas.near'
};

/**
 * The default configuration used by the SDK (currently Testnet).
 */
export const DEFAULT_CONFIG: YouTickConfig = TESTNET_CONFIG;
