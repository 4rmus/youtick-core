# YouTick Core SDK
A lightweight, modular SDK for building decentralized media applications on NEAR Protocol, leveraging Lit Protocol for encryption and Chain Signatures.

## Features
- **NEAR Session Keys**: Manage frictionless user sessions with prepaid gas.
- **Lit Protocol Integration**: Encrypt/Decrypt content and mint PKPs (Programmable Key Pairs).
- **Chain Signatures (MPC)**: Sign EVM transactions using NEAR accounts.
- **Abstracted Auth**: Helper functions for verification using generic Lit Actions.

## Installation
```bash
npm install @youtick/sdk
```

## Usage

### Configuration
```typescript
import { LitClient, SessionManager, DEFAULT_CONFIG } from '@youtick/sdk';

const config = {
    ...DEFAULT_CONFIG,
    networkId: 'testnet',
    contractId: 'v1-0-0.utick.testnet'
};

const sessionManager = new SessionManager('user.testnet', config);
const litClient = new LitClient(config);
```

### Chain Signatures
```typescript
import { MPCSigner, deriveEthAddress } from '@youtick/sdk';

// Derive ETH address for a NEAR account
const ethAddress = await deriveEthAddress('user.testnet', 'lit/pkp-minting');

// Sign a transaction
const signer = new MPCSigner(wallet, 'user.testnet');
const tx = await signer.signTransaction({ ... });
```
