
export interface YouTickConfig {
    networkId: string;
    contractId: string;
    nodeUrl: string;
    litNetwork: "datil-dev" | "datil-test" | "datil";
    litActionIpfsId?: string;
    rpcUrl?: string; // For Lit or NEAR proxy
}

export const DEFAULT_CONFIG: YouTickConfig = {
    networkId: 'testnet',
    contractId: 'v1-0-0.utick.testnet',
    nodeUrl: 'https://rpc.testnet.near.org',
    litNetwork: 'datil-test'
};
