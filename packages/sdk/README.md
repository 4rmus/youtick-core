# @youtick/sdk

The official core SDK for the YouTick Decentralized Video Platform. This SDK bridges the gap between NEAR Protocol's high-performance blockchain, user-friendly Session Keys, and Lit Protocol's decentralized encryption and multi-party computation (MPC) capabilities.

## Features

- **Decentralized Encryption**: easy-to-use wrappers around Lit Protocol to encrypt video content and metadata.
- **NEAR Session Keys**: frictionless, signature-free user experiences by using local keys with prepaid gas.
- **Chain Signatures (MPC)**: enable NEAR accounts to sign transactions on any chain (Ethereum, Bitcoin, etc.) using Programmable Key Pairs (PKP).
- **Auto-Configured**: Pre-loaded with necessary contract addresses and IPFS CIDs for the YouTick ecosystem.

## Installation

```bash
npm install @youtick/sdk eth-crypto ethers near-api-js @lit-protocol/lit-node-client
```

## Quick Start

### Configuration

The SDK comes with default configuration for the NEAR Testnet. For **Mainnet** deployment, ensure you transition to the `datil` network and use a production contract ID.

```typescript
import { DEFAULT_CONFIG, YouTickConfig } from '@youtick/sdk';

// Testnet (Default)
const testnetConfig = { ...DEFAULT_CONFIG };

// Mainnet (Production)
const mainnetConfig: YouTickConfig = {
    networkId: 'mainnet',
    contractId: 'prod.youtick.near',
    nodeUrl: 'https://rpc.mainnet.near.org',
    litNetwork: 'datil', // Use 'datil' for production
    mpcContractId: 'signer.canhazgas.near'
};
```

> [!CAUTION]
> **Mainnet Readiness:**
> When moving to Mainnet, ensure your `contractId` is audited and your Lit Protocol access control conditions are rigorously tested to prevent unauthorized content decryption.

---

### Module: NEAR Session Management

Session keys allow users to interact with your dApp without constantly approving transactions in their wallet.

```typescript
import { Near, WalletInterface } from '@youtick/sdk';

// Initialize Manager
const sessionManager = new Near.SessionManager('user.testnet', config);

// Check if session exists
const hasSession = await sessionManager.hasSessionKey();

if (!hasSession) {
    // initialize session (requires wallet interaction)
    // Wallet object must satisfy WalletInterface (like @near-wallet-selector)
    await sessionManager.createSessionKey(wallet, '2'); // Deposit 2 NEAR for gas
}

// Call contract method (NO wallet popup needed)
await sessionManager.callMethod('buy_ticket', { cid: '...' });
```

---

### Module: Lit Protocol Encryption

Encrypt and decrypt content using Access Control Conditions (ACCs).

```typescript
import { Lit } from '@youtick/sdk';

const litClient = new Lit.LitClient(config);
await litClient.connect();

// 1. Encrypt Content
const { ciphertext, dataToEncryptHash } = await litClient.encryptFile(
    file,
    [
        {
            contractAddress: '',
            standardContractType: '',
            chain: 'ethereum',
            method: 'eth_getBalance',
            parameters: [':userAddress', 'latest'],
            returnValueTest: {
                comparator: '>=',
                value: '0', // User must own at least 0 ETH (Public access example)
            },
        },
    ],
    authSig // SIWE AuthSig
);

// 2. Decrypt Content
const decryptedFile = await litClient.decryptFile(
    ciphertext,
    dataToEncryptHash,
    [...accessConditions],
    authSig
);
```

---

### Module: MPC & Chain Signatures

Sign Ethereum transactions using a NEAR account.

```typescript
import { Near, MPCSigner } from '@youtick/sdk';
import { ethers } from 'ethers';

// 1. Derive ETH Address from NEAR Account
const mpcAddress = await Near.deriveEthAddress('user.testnet', 'lit/pkp-minting');
console.log(`Derived ETH Address: ${mpcAddress}`);

// 2. Sign Transaction
const provider = new ethers.JsonRpcProvider('https://eth-sepolia.public.blastapi.io');
const signer = new MPCSigner(wallet, 'user.testnet', 'lit/pkp-minting', provider);

const tx = await signer.sendTransaction({
    to: '0x...',
    value: ethers.parseEther('0.01')
});

console.log('TX Hash:', tx.hash);
```

## API Reference

### `YouTickConfig`
- `networkId`: NEAR network ('testnet' | 'mainnet')
- `contractId`: YouTick smart contract ID
- `nodeUrl`: NEAR RPC URL
- `litNetwork`: Lit Protocol network ('datil', 'datil-test')
- `mpcContractId`: NEAR MPC contract ID

### `SessionManager`
- `createSessionKey(wallet, gasAmount)`: Creates key and deposits gas.
- `callMethod(method, args, gas)`: Executes contract call with session key.

### `LitClient`
- `getSessionSigsWithPKP(...)`: Get session signatures using a PKP/Lit Action.
- `encryptFile(...)`: Encrypt user content.
- `decryptFile(...)`: Decrypt user content.

## License

MIT © 2024 YouTick
