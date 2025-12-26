# YouTick Core: Decentralized Media Foundation

<div align="center">

**The Open-Source SDK & Starter Kit for Building Signless, Serverless Media dApps on NEAR Protocol**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![NEAR](https://img.shields.io/badge/NEAR-Protocol-blue)](https://near.org)
[![Lit Protocol](https://img.shields.io/badge/Lit-Protocol-purple)](https://litprotocol.com)

[Documentation](./packages/sdk/README.md) · [Quick Start](#-quick-start) · [Reference App](https://youtick.net)

</div>

---

## 🌟 Overview

**YouTick Core** is a production-ready foundation for building fully decentralized Video-on-Demand (VOD) applications. This monorepo provides:

1. **`@youtick/sdk`**: A modular TypeScript SDK implementing NEAR Chain Signatures, Lit Protocol encryption, and Session Key management.
2. **`apps/minimal`**: A complete Next.js starter kit demonstrating NFT ticketing and encrypted video playback.

### Why YouTick?

Traditional media dApps fail due to "**Signature Fatigue**" and "**Infrastructure Lock-in**". YouTick eliminates both through a **Zero-Server Economy**:

| Problem | YouTick Solution |
|---------|------------------|
| Multiple wallet signatures per action | **Signless UX** via NEAR Session Keys & MPC |
| Centralized key servers for encryption | **Decentralized Access Control** via Lit Protocol |
| High storage costs & vendor lock-in | **Permanent Storage** via IPFS/Lighthouse |
| Complex user onboarding | **Sponsored Relayers** for gasless first experience |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           YouTick Ecosystem                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐     ┌──────────────────┐     ┌─────────────────┐ │
│  │   NEAR Protocol   │     │   Lit Protocol    │     │   Lighthouse    │ │
│  │  - Session Keys   │     │  - PKP Auth       │     │   (IPFS)        │ │
│  │  - MPC Signatures │     │  - Encryption     │     │  - Video Store  │ │
│  │  - NFT Ticketing  │     │  - Access Control │     │  - Metadata     │ │
│  └────────┬─────────┘     └────────┬─────────┘     └────────┬────────┘ │
│           │                        │                         │          │
│           └────────────────────────┼─────────────────────────┘          │
│                                    │                                     │
│                         ┌──────────▼──────────┐                         │
│                         │   @youtick/sdk      │                         │
│                         │   (Core Library)    │                         │
│                         └──────────┬──────────┘                         │
│                                    │                                     │
│           ┌────────────────────────┼────────────────────────┐           │
│           │                        │                        │           │
│  ┌────────▼────────┐      ┌────────▼────────┐      ┌───────▼───────┐   │
│  │  apps/minimal   │      │   youtick.net   │      │  Your dApp    │   │
│  │  (Starter Kit)  │      │ (Reference App) │      │  (Build Here) │   │
│  └─────────────────┘      └─────────────────┘      └───────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** v18 or higher
- **npm** v8 or higher

### 1. Clone & Install

```bash
git clone https://github.com/4rmus/youtick-core.git
cd youtick-core
npm install
```

### 2. Build the SDK

The SDK must be compiled before use:

```bash
npm run build --workspace=packages/sdk
```

### 3. Run the Minimal Demo App

```bash
npm run dev --workspace=apps/minimal
```

Open [http://localhost:3000](http://localhost:3000) and follow the on-screen flow to:
1. Connect your NEAR wallet
2. Set up a Session Key (one signature)
3. Upload & encrypt a video
4. Mint an NFT ticket
5. Purchase and watch the content (signless!)

---

## 🧪 Testing with NEAR Dev-Accounts

For rapid development and testing without risking real funds:

### Option A: Use the Pre-Deployed Contract (Recommended)

The SDK is pre-configured to use our Testnet contract:
```
Contract ID: sdk-1-0.utick.testnet
Network: testnet
```

### Option B: Deploy Your Own Contract

```bash
# 1. Create a dev account (includes 10 NEAR faucet)
near create-account YOUR_NAME.testnet --useFaucet

# 2. Deploy the contract (contact us for WASM or build from source)
near deploy YOUR_NAME.testnet \
  --wasmFile ./contracts/nft_ticket.wasm \
  --initFunction new \
  --initArgs '{"owner_id": "YOUR_NAME.testnet"}'

# 3. Update your .env.local
echo "NEXT_PUBLIC_CONTRACT_ID=YOUR_NAME.testnet" > apps/minimal/.env.local
```

### Environment Variables

Create `apps/minimal/.env.local`:

```bash
# Required
NEXT_PUBLIC_CONTRACT_ID=sdk-1-0.utick.testnet

# Optional (for video upload)
NEXT_PUBLIC_LIGHTHOUSE_API_KEY=your_lighthouse_key
NEXT_PUBLIC_MOCK_IPFS=true  # Use mock storage for testing
```

---

## 📦 Monorepo Structure

```
youtick-core/
├── packages/
│   └── sdk/                 # @youtick/sdk - Core TypeScript library
│       ├── src/
│       │   ├── auth/        # SessionManager, Session Keys
│       │   ├── lit/         # LitClient, PKP management
│       │   ├── storage/     # Lighthouse IPFS integration
│       │   └── utils/       # Batch transactions, helpers
│       ├── examples/        # Usage examples
│       └── README.md        # SDK documentation
│
├── apps/
│   └── minimal/             # Next.js VOD Starter Kit
│       ├── src/app/         # Pages and components
│       └── README.md        # App documentation
│
└── README.md                # You are here
```

---

## 💎 Reference Implementation: youtick.net

[**youtick.net**](https://youtick.net) is our production-tier VOD application built on this core framework. It demonstrates:

- **Full NFT Ticketing Flow**: Create events, mint tickets, gate content.
- **Mainnet-Ready Architecture**: Production Lit Protocol (Datil) integration.
- **Professional UI/UX**: A benchmark for decentralized media applications.

> 📌 **Note**: `youtick.net` is maintained in a separate repository. This core repo provides the foundational tooling for any developer to build similar applications.

---

## 🔧 SDK Highlights

### SessionManager: Signless Transactions

```typescript
import { SessionManager, TESTNET_CONFIG } from '@youtick/sdk';

// Initialize with your account
const session = new SessionManager('user.testnet', TESTNET_CONFIG);

// Create a session key (requires one wallet signature)
await session.createSessionKey(wallet, '1.0'); // 1 NEAR for prepaid gas

// All subsequent calls are signless!
await session.callMethod('nft_mint_prepaid', { ... });
await session.callMethod('buy_ticket_prepaid', { ... });
```

### LitClient: Decentralized Encryption

```typescript
import { LitClient, TESTNET_CONFIG } from '@youtick/sdk';

const lit = new LitClient(TESTNET_CONFIG);
await lit.connect();

// Encrypt with Access Control Conditions
const { ciphertext, dataToEncryptHash } = await lit.encryptFile(
  videoFile,
  accessControlConditions,
  authSig
);

// Decrypt (only if conditions are met)
const decrypted = await lit.decryptFile(
  ciphertext,
  dataToEncryptHash,
  accessControlConditions,
  authSig
);
```

### Sponsor-Agnostic Relayer

```typescript
// Creators can fund gas for their users (gasless onboarding)
await session.fundUser(creatorWallet, 'new-user.testnet', '2.0');
```

---

## 📚 Documentation

| Resource | Description |
|----------|-------------|
| [SDK README](./packages/sdk/README.md) | Full API reference and advanced usage |
| [Minimal App README](./apps/minimal/README.md) | Step-by-step demo guide |
| [youtick.net](https://youtick.net) | Live reference application |

---

## 🤝 Contributing

We welcome contributions! Please see our guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

MIT © 2024 YouTick Foundation

---

<div align="center">

**Built as a Public Good for the NEAR Ecosystem**

[GitHub](https://github.com/4rmus/youtick-core) · [Reference App](https://youtick.net)

</div>
