# YouTick Minimal Demo App

A minimal Next.js application demonstrating the **YouTick SDK** for decentralized video ticketing on NEAR Protocol.

## 🎬 What is YouTick?

YouTick enables creators to sell access to exclusive video content through NFT tickets. Videos are encrypted and stored on IPFS, and only ticket holders can decrypt and watch them.

**Key Features:**
- 🔐 NFT-gated video access
- 🎫 On-chain ticket sales
- 📹 IPFS-based encrypted video storage
- ⚡ Session keys for gasless transactions
- 🔗 Lit Protocol for decentralized encryption

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and **npm**
- **NEAR Testnet wallet** ([Create one here](https://testnet.mynearwallet.com/))
- (Optional) **NEAR CLI** for contract deployment

### Installation

```bash
# Clone the repository
git clone https://github.com/4rmus/youtick-core.git
cd youtick-core

# Install dependencies
npm install

# Navigate to the minimal app
cd apps/minimal
```

### Configuration

Create a `.env.local` file:

```env
NEXT_PUBLIC_LIGHTHOUSE_API_KEY=your_lighthouse_api_key
NEXT_PUBLIC_MOCK_IPFS=true
```

> **Note:** Set `NEXT_PUBLIC_MOCK_IPFS=false` and add a valid Lighthouse API key for real IPFS uploads.

### Run the App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Testing the Demo Flow

### 1. Connect Wallet
Click **"Connect Wallet"** and sign in with your NEAR testnet account.

### 2. Setup Session Key
Click **"Setup Session Key"** to enable gasless transactions. This creates a temporary key that can sign transactions on your behalf.

### 3. Mint a Ticket (Create Content)
- Enter a **title** and **price** (in NEAR)
- Select a video file (or use mock mode)
- Click **"Mint Ticket"**

This creates an event on the blockchain and uploads the encrypted video.

### 4. Buy a Ticket
- Find a ticket you don't own in the list
- Click **"Buy Ticket"**
- Approve the transaction in your wallet

### 5. Watch the Video
After purchase, clicks **"Watch"** to decrypt and play the video.

---

##  SDK Usage

The app demonstrates these SDK features:

```typescript
import { SessionManager, LitClient, LighthouseClient, DEFAULT_CONFIG } from "@youtick/sdk";

// Create session manager
const sessionManager = new SessionManager(accountId);

// Check session key
const hasKey = await sessionManager.hasSessionKey();

// View contract methods
const events = await sessionManager.viewMethod('get_events', { from_index: "0", limit: 50 });
const tickets = await sessionManager.viewMethod('get_tokens_with_video', { account_id: "user.testnet" });

// Initialize Lit Protocol for encryption
const litClient = new LitClient();
await litClient.connect();

// Upload to IPFS
const lighthouse = new LighthouseClient(process.env.NEXT_PUBLIC_LIGHTHOUSE_API_KEY);
const cid = await lighthouse.uploadFile(file);
```

---

## 🛠️ Project Structure

```
apps/minimal/
├── src/
│   └── app/
│       ├── page.tsx       # Main application
│       └── globals.css    # Styles
├── .env.local             # Environment variables
└── package.json

packages/sdk/
├── src/
│   ├── auth/session.ts    # Session key management
│   ├── lit/               # Lit Protocol integration
│   ├── storage/           # IPFS/Lighthouse
│   └── contract/          # NEAR contract interface
└── package.json
```

---

## 🔍 Troubleshooting

### CORS Errors with MyNearWallet
These are internal MyNearWallet issues with `rpc.testnet.near.org`. The app uses FastNear RPC to avoid this, but MyNearWallet may still show errors. These don't affect functionality.

### "Insufficient deposit" Error
The ticket price must include storage costs. The app automatically adds 0.01 NEAR to cover this.

### Video Not Playing After Purchase
1. Refresh the page after returning from the wallet
2. Check the browser console for ownership status
3. Ensure the CID matches between ticket and event

---

## 📄 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_LIGHTHOUSE_API_KEY` | API key for Lighthouse IPFS | No (uses mock) |
| `NEXT_PUBLIC_MOCK_IPFS` | Use mock IPFS for testing | No (default: true) |

---

## 🔗 Resources

- [NEAR Protocol Docs](https://docs.near.org/)
- [NEAR Wallet Selector](https://github.com/near/wallet-selector)
- [Lit Protocol Docs](https://developer.litprotocol.com/)
- [Lighthouse Storage](https://www.lighthouse.storage/)

---

## 📝 License

MIT License - see [LICENSE](../../LICENSE) for details.
