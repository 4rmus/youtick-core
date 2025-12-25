// src/config.ts
var DEFAULT_CONFIG = {
  networkId: "testnet",
  contractId: "v1-0-0.utick.testnet",
  nodeUrl: "https://rpc.testnet.near.org",
  litNetwork: "datil-test"
};

// src/lit/client.ts
import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { LitAbility } from "@lit-protocol/constants";
import { encryptFile, decryptToFile } from "@lit-protocol/encryption";
import { LitAccessControlConditionResource, LitPKPResource, LitActionResource } from "@lit-protocol/auth-helpers";

// src/types.ts
var MemoryStorage = class {
  constructor() {
    this.storage = /* @__PURE__ */ new Map();
  }
  getItem(key) {
    return this.storage.get(key) || null;
  }
  setItem(key, value) {
    this.storage.set(key, value);
  }
  removeItem(key) {
    this.storage.delete(key);
  }
};

// src/lit/client.ts
var LitClient = class {
  constructor(config = DEFAULT_CONFIG, storage) {
    this.SESSION_CACHE_KEY = "lit_session_sigs";
    this.config = config;
    this.storage = storage || (typeof window !== "undefined" ? localStorage : new MemoryStorage());
    this.litNodeClient = new LitNodeClient({
      litNetwork: this.config.litNetwork,
      debug: false,
      rpcUrl: this.config.rpcUrl
    });
  }
  async connect() {
    if (!this.litNodeClient.ready) {
      await this.litNodeClient.connect();
    }
  }
  /**
   * Get session signatures using a PKP (signless experience).
   * Uses Lit Action to verify NEAR signature and authorize the PKP.
   */
  async getSessionSigsWithPKP(pkpPublicKey, pkpEthAddress, nearAccountId, capacityDelegationAuthSig) {
    await this.connect();
    const litActionIpfsCid = this.config.litActionIpfsId || "Qmc6cLer2fmtuzNFhdtBoZvM1gCzX9s8gbc8wzWdizeuJe";
    const sessionParams = {
      pkpPublicKey,
      litActionIpfsId: litActionIpfsCid,
      jsParams: {
        pkpPublicKey
      },
      resourceAbilityRequests: [
        {
          resource: new LitAccessControlConditionResource("*"),
          ability: LitAbility.AccessControlConditionDecryption
        },
        {
          resource: new LitPKPResource("*"),
          ability: LitAbility.PKPSigning
        },
        {
          resource: new LitActionResource("*"),
          ability: LitAbility.LitActionExecution
        }
      ],
      expiration: new Date(Date.now() + 1e3 * 60 * 60 * 24).toISOString()
      // 24 hours
    };
    if (capacityDelegationAuthSig) {
      sessionParams.capabilityAuthSigs = [capacityDelegationAuthSig];
    }
    const sessionSigs = await this.litNodeClient.getLitActionSessionSigs(sessionParams);
    return sessionSigs;
  }
  async encryptFile(file, accessControlConditions, authSig, chain = "ethereum", sessionSigs) {
    await this.connect();
    const params = {
      file,
      chain,
      unifiedAccessControlConditions: accessControlConditions
    };
    if (sessionSigs) {
      params.sessionSigs = sessionSigs;
    } else {
      params.authSig = authSig;
    }
    return await encryptFile(params, this.litNodeClient);
  }
  async decryptFile(ciphertext, dataToEncryptHash, accessControlConditions, authSig, chain = "ethereum", sessionSigs) {
    await this.connect();
    const params = {
      ciphertext,
      dataToEncryptHash,
      chain,
      unifiedAccessControlConditions: accessControlConditions
    };
    if (sessionSigs) {
      params.sessionSigs = sessionSigs;
    } else {
      params.authSig = authSig;
    }
    return await decryptToFile(params, this.litNodeClient);
  }
};

// src/lit/pkp.ts
import { LitAbility as LitAbility2 } from "@lit-protocol/constants";
import { LitPKPResource as LitPKPResource2 } from "@lit-protocol/auth-helpers";

// src/lit/actions/near-auth.ts
var NEAR_AUTH_LIT_ACTION_CODE = `
(async () => {
    try {
        const { publicKey, signature, message } = jsParams;
        if (!publicKey || !signature || !message) {
            throw new Error("Missing required params: publicKey, signature, message");
        }
        
        const nacl = await import('tweetnacl');
        
        let pubKeyBytes;
        if (publicKey.startsWith('ed25519:')) {
            const base58Key = publicKey.slice(8);
            const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
            const base58Decode = (str) => {
                const bytes = [];
                for (let i = 0; i < str.length; i++) {
                    const char = str[i];
                    const charIndex = ALPHABET.indexOf(char);
                    if (charIndex === -1) throw new Error('Invalid base58 character');
                    
                    let carry = charIndex;
                    for (let j = 0; j < bytes.length; j++) {
                        carry += bytes[j] * 58;
                        bytes[j] = carry & 0xff;
                        carry >>= 8;
                    }
                    while (carry > 0) {
                        bytes.push(carry & 0xff);
                        carry >>= 8;
                    }
                }
                for (let i = 0; i < str.length && str[i] === '1'; i++) {
                    bytes.push(0);
                }
                return new Uint8Array(bytes.reverse());
            };
            pubKeyBytes = base58Decode(base58Key);
        } else {
            throw new Error("Invalid public key format - must start with 'ed25519:'");
        }
        
        const sigBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
        const msgBytes = new TextEncoder().encode(message);
        
        const isValid = nacl.default.sign.detached.verify(msgBytes, sigBytes, pubKeyBytes);
        
        if (!isValid) {
            throw new Error("NEAR signature verification failed");
        }
        
        Lit.Actions.setResponse({ 
            response: JSON.stringify({ 
                verified: true, 
                uid: publicKey,
                accountId: message.match(/account\\s+(\\S+)/)?.[1] || publicKey
            }) 
        });
        
    } catch (error) {
        Lit.Actions.setResponse({ 
            response: JSON.stringify({ 
                verified: false, 
                error: error.message 
            }) 
        });
        throw error;
    }
})();
`;
var NEAR_AUTH_LIT_ACTION_BASE64 = typeof Buffer !== "undefined" ? Buffer.from(NEAR_AUTH_LIT_ACTION_CODE).toString("base64") : btoa(NEAR_AUTH_LIT_ACTION_CODE);

// src/lit/pkp.ts
var PKPManager = class {
  constructor(litNodeClient) {
    this.litNodeClient = litNodeClient;
  }
  /**
   * Mint a new PKP for the user using their NEAR account + MPC-derived ETH wallet as Auth Method.
   * Uses Lit Relay Server for gas-free minting.
   */
  async mintPKPWithNear(nearAccountId, nearPublicKey, signature, message, signer, relayApiKey, useMock = true) {
    console.log(`Minting PKP for NEAR Account: ${nearAccountId}`);
    if (useMock || !signer) {
      console.log("Using mock minting (no relay key or signer provided)");
      await new Promise((resolve) => setTimeout(resolve, 2e3));
      return {
        tokenId: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        publicKey: "0x0430591451f28b3687eec82601962383842d05713437299a4e216db8a2b5368a5c4cc31d87ee96c5685718df2894b5f884a44b937080b0bb183e2da025686008ab",
        ethAddress: "0x7bd19343d242253818e6922261a861611029c7d4",
        nearImplicitAccount: "30591451f28b3687eec82601962383842d05713437299a4e216db8a2b5368a5c"
      };
    }
    try {
      const { EthWalletProvider, LitRelay } = await import("@lit-protocol/lit-auth-client");
      const { LitNetwork } = await import("@lit-protocol/constants");
      const authMethod = await EthWalletProvider.authenticate({
        signer,
        litNodeClient: this.litNodeClient
      });
      if (!relayApiKey) {
        throw new Error("Relay API Key is required for real minting");
      }
      const relay = new LitRelay({
        relayApiKey,
        relayUrl: LitRelay.getRelayUrl(LitNetwork.DatilTest)
      });
      const pkpResult = await relay.mintPKPWithAuthMethods([authMethod], {
        addPkpEthAddressAsPermittedAddress: true,
        sendPkpToitself: true
      });
      return {
        tokenId: pkpResult.pkpTokenId || "",
        publicKey: pkpResult.pkpPublicKey || "",
        ethAddress: pkpResult.pkpEthAddress || "",
        nearImplicitAccount: nearAccountId
      };
    } catch (e) {
      console.error("Real minting failed:", e);
      throw e;
    }
  }
  /**
   * Mint a PKP directly via contracts with Lit Action auth method.
   */
  async mintPKPDirect(signer, litActionIpfsCid, rpcUrl) {
    try {
      const { LitContracts } = await import("@lit-protocol/contracts-sdk");
      const { LitNetwork } = await import("@lit-protocol/constants");
      const ethers5 = await import("ethers5");
      const effectiveRpcUrl = rpcUrl || "https://yellowstone-rpc.litprotocol.com";
      const litContracts = new LitContracts({
        signer,
        network: LitNetwork.DatilTest,
        rpc: effectiveRpcUrl,
        debug: false
      });
      await litContracts.connect();
      const mintCost = await litContracts.pkpNftContract.read.mintCost();
      const authMethodType = 2;
      const authMethodId = litContracts.utils.getBytesFromMultihash(litActionIpfsCid);
      const authMethodPubkey = "0x";
      const tx = await litContracts.pkpHelperContract.write.mintNextAndAddAuthMethods(
        2,
        // keyType: ECDSA
        [authMethodType],
        [authMethodId],
        [authMethodPubkey],
        [[1, 2, 17]],
        // SignAnything + PersonalSign + GrantDecrypt
        true,
        // addPkpEthAddressAsPermittedAddress
        true,
        // sendPkpToItself
        { value: mintCost }
      );
      const receipt = await tx.wait();
      let tokenId = "";
      const nftInterface = new ethers5.utils.Interface([
        "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
      ]);
      for (const log of receipt.logs) {
        try {
          const parsed = nftInterface.parseLog(log);
          if (parsed && parsed.name === "Transfer" && parsed.args.from === ethers5.constants.AddressZero) {
            tokenId = parsed.args.tokenId.toString();
          }
        } catch (e) {
        }
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
    } catch (e) {
      console.error("Minting with auth method failed:", e);
      throw e;
    }
  }
  async getPKPSessionSigs(pkpPublicKey, nearSignCallback) {
    const { sig, msg, pk } = await nearSignCallback();
    return this.litNodeClient.getPkpSessionSigs({
      pkpPublicKey,
      authMethods: [
        {
          authMethodType: 99999,
          // Custom Auth Type ID
          accessToken: JSON.stringify({ sig, msg, pk })
        }
      ],
      resourceAbilityRequests: [
        {
          resource: new LitPKPResource2("*"),
          ability: LitAbility2.PKPSigning
        }
      ],
      litActionCode: NEAR_AUTH_LIT_ACTION_CODE,
      jsParams: {
        publicKey: pk,
        sig,
        message: msg
      }
    });
  }
};

// src/near/chain-signatures.ts
import { ethers } from "ethers";
import { providers, transactions, utils } from "near-api-js";
import { ec as EC } from "elliptic";
import BN from "bn.js";
import { sha3_256 } from "js-sha3";
var MPC_CONTRACT = "v1.signer-prod.testnet";
async function deriveEthAddress(accountId, path, config = DEFAULT_CONFIG) {
  const cacheKey = `mpc_address_v8_${accountId}_${path}`;
  if (typeof window !== "undefined") {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      return cached;
    }
  }
  const provider = new providers.JsonRpcProvider({ url: config.nodeUrl });
  let masterKey;
  try {
    const result = await provider.query({
      request_type: "call_function",
      account_id: MPC_CONTRACT,
      method_name: "public_key",
      args_base64: Buffer.from("{}").toString("base64"),
      finality: "final"
    });
    const keyBytes = result.result;
    const rawString = String.fromCharCode(...keyBytes);
    masterKey = JSON.parse(rawString);
  } catch (e) {
    console.error("Failed to fetch MPC master key:", e);
    masterKey = "secp256k1:4HFcTSodRLVCGNVreQW2nRoAT1g8jU6db747155tYf49P7c5t578D5588C889988";
  }
  const effectiveCallerId = config.contractId;
  const compositePath = `${effectiveCallerId}/${path}`;
  const derivedKey = deriveChildKey(masterKey, effectiveCallerId, compositePath);
  const derivedPoint = derivedKey.replace(/^secp256k1:/, "");
  const address = ethers.computeAddress("0x" + derivedPoint);
  if (typeof window !== "undefined") {
    localStorage.setItem(cacheKey, address);
  }
  return address;
}
function deriveChildKey(masterKeyStr, accountId, path) {
  const ec = new EC("secp256k1");
  const masterKeyBase58 = masterKeyStr.replace("secp256k1:", "");
  const masterKeyBytes = utils.serialize.base_decode(masterKeyBase58);
  let masterKeyHex = Buffer.from(masterKeyBytes).toString("hex");
  if (masterKeyHex.length === 128) {
    masterKeyHex = "04" + masterKeyHex;
  }
  const masterPoint = ec.keyFromPublic(masterKeyHex, "hex").getPublic();
  const derivation_path = `near-mpc-recovery v0.1.0 epsilon derivation:${accountId},${path}`;
  const scalarHex = sha3_256(derivation_path);
  const scalar = new BN(scalarHex, 16);
  const pointToAdd = ec.g.mul(scalar);
  const derivedPoint = masterPoint.add(pointToAdd);
  return derivedPoint.encode("hex", false);
}
async function signWithMPC(wallet, accountId, path, message, config) {
  const messageHash = ethers.hashMessage(message);
  const payload = Array.from(ethers.getBytes(messageHash));
  const args = {
    request: {
      payload,
      path,
      key_version: 0
    }
  };
  const functionCallAction = transactions.functionCall(
    "sign",
    Buffer.from(JSON.stringify(args)),
    new BN("300000000000000"),
    // 300 TGas
    new BN("100000000000000000000000")
    // 0.1 NEAR
  );
  const result = await wallet.signAndSendTransaction({
    receiverId: MPC_CONTRACT,
    actions: [functionCallAction]
  });
  const successValue = result.status.SuccessValue;
  if (!successValue) {
    throw new Error("Failed to get signature from transaction result");
  }
  return JSON.parse(Buffer.from(successValue, "base64").toString());
}
var MPCSigner = class _MPCSigner extends ethers.AbstractSigner {
  constructor(wallet, nearAccountId, derivationPath = "lit/pkp-minting", provider, config = DEFAULT_CONFIG) {
    super(provider);
    this._address = null;
    this.wallet = wallet;
    this.nearAccountId = nearAccountId;
    this.derivationPath = derivationPath;
    this.config = config;
  }
  async getAddress() {
    if (!this._address) {
      this._address = await deriveEthAddress(this.nearAccountId, this.derivationPath, this.config);
    }
    return this._address;
  }
  connect(provider) {
    return new _MPCSigner(this.wallet, this.nearAccountId, this.derivationPath, provider, this.config);
  }
  async signTransaction(tx) {
    const address = await this.getAddress();
    const populatedTx = await this.populateTransaction(tx);
    const unsignedTx = ethers.Transaction.from({
      ...populatedTx,
      from: address
    });
    const txHash = unsignedTx.unsignedHash;
    const payload = Array.from(ethers.getBytes(txHash));
    const args = {
      request: {
        payload,
        path: this.derivationPath,
        key_version: 0
      }
    };
    const functionCallAction = transactions.functionCall(
      "sign",
      Buffer.from(JSON.stringify(args)),
      new BN("300000000000000"),
      // 300 TGas
      new BN("100000000000000000000000")
      // 0.1 NEAR
    );
    const result = await this.wallet.signAndSendTransaction({
      receiverId: MPC_CONTRACT,
      actions: [functionCallAction]
    });
    const successValue = result.status.SuccessValue;
    if (!successValue) {
      throw new Error("MPC signing failed");
    }
    const mpcSig = JSON.parse(Buffer.from(successValue, "base64").toString());
    const r = "0x" + mpcSig.big_r.affine_point.substring(2, 66);
    const s = "0x" + mpcSig.s.scalar;
    const v = mpcSig.recovery_id + 27;
    const signedTx = unsignedTx.clone();
    signedTx.signature = ethers.Signature.from({ r, s, v });
    return signedTx.serialized;
  }
  async signMessage(message) {
    const msgBytes = typeof message === "string" ? ethers.toUtf8Bytes(message) : message;
    const messageHash = ethers.hashMessage(msgBytes);
    const payload = Array.from(ethers.getBytes(messageHash));
    const args = {
      request: {
        payload,
        path: this.derivationPath,
        key_version: 0
      }
    };
    const functionCallAction = transactions.functionCall(
      "sign",
      Buffer.from(JSON.stringify(args)),
      new BN("300000000000000"),
      // 300 TGas
      new BN("100000000000000000000000")
      // 0.1 NEAR
    );
    const result = await this.wallet.signAndSendTransaction({
      receiverId: MPC_CONTRACT,
      actions: [functionCallAction]
    });
    const successValue = result.status.SuccessValue;
    if (!successValue) {
      throw new Error("MPC message signing failed");
    }
    const mpcSig = JSON.parse(Buffer.from(successValue, "base64").toString());
    const r = "0x" + mpcSig.big_r.affine_point.substring(2, 66);
    const s = "0x" + mpcSig.s.scalar;
    const v = mpcSig.recovery_id + 27;
    return ethers.Signature.from({ r, s, v }).serialized;
  }
  async signTypedData(domain, types, value) {
    const hash = ethers.TypedDataEncoder.hash(domain, types, value);
    const payload = Array.from(ethers.getBytes(hash));
    const args = {
      request: {
        payload,
        path: this.derivationPath,
        key_version: 0
      }
    };
    const functionCallAction = transactions.functionCall(
      "sign",
      Buffer.from(JSON.stringify(args)),
      new BN("300000000000000"),
      // 300 TGas
      new BN("100000000000000000000000")
      // 0.1 NEAR
    );
    const result = await this.wallet.signAndSendTransaction({
      receiverId: MPC_CONTRACT,
      actions: [functionCallAction]
    });
    const successValue = result.status.SuccessValue;
    if (!successValue) {
      throw new Error("MPC typed data signing failed");
    }
    const mpcSig = JSON.parse(Buffer.from(successValue, "base64").toString());
    const r = "0x" + mpcSig.big_r.affine_point.substring(2, 66);
    const s = "0x" + mpcSig.s.scalar;
    const v = mpcSig.recovery_id + 27;
    return ethers.Signature.from({ r, s, v }).serialized;
  }
};

// src/near/session.ts
import { keyStores, KeyPair, connect, providers as providers2, transactions as transactions2, utils as utils2 } from "near-api-js";
import BN2 from "bn.js";
var SessionManager = class {
  constructor(accountId, config = DEFAULT_CONFIG, keyStore) {
    this.accountId = accountId;
    this.config = config;
    if (keyStore) {
      this.keyStore = keyStore;
    } else if (typeof window !== "undefined") {
      this.keyStore = new keyStores.BrowserLocalStorageKeyStore();
    } else {
      this.keyStore = new keyStores.InMemoryKeyStore();
    }
  }
  async hasSessionKey() {
    const keyPair = await this.keyStore.getKey(this.config.networkId, this.accountId);
    if (!keyPair) return false;
    try {
      const near = await connect({
        networkId: this.config.networkId,
        keyStore: this.keyStore,
        nodeUrl: this.config.nodeUrl
      });
      const account = await near.account(this.accountId);
      const accessKeys = await account.getAccessKeys();
      const publicKey = keyPair.getPublicKey().toString();
      const accessKeyInfo = accessKeys.find((k) => k.public_key === publicKey);
      if (!accessKeyInfo) {
        console.warn("Session key found locally but not on-chain. Removing.");
        await this.keyStore.removeKey(this.config.networkId, this.accountId);
        return false;
      }
      const permission = accessKeyInfo.access_key.permission;
      if (typeof permission === "object" && "FunctionCall" in permission) {
        if (permission.FunctionCall.receiver_id !== this.config.contractId) {
          console.warn(`Session key found but for wrong contract (${permission.FunctionCall.receiver_id} vs ${this.config.contractId}). Removing.`);
          await this.keyStore.removeKey(this.config.networkId, this.accountId);
          return false;
        }
      }
      return true;
    } catch (e) {
      console.warn("Error checking session key on-chain. Assuming local key is valid.", e);
      return true;
    }
  }
  async createSessionKey(wallet, gasAmount = "1") {
    const keyPair = KeyPair.fromRandom("ed25519");
    const publicKey = keyPair.getPublicKey().toString();
    await this.keyStore.setKey(this.config.networkId, this.accountId, keyPair);
    await this.batchInitialSetup(wallet, publicKey, gasAmount);
  }
  async createSessionKeyMinimal(wallet) {
    const keyPair = KeyPair.fromRandom("ed25519");
    const publicKey = keyPair.getPublicKey().toString();
    await this.keyStore.setKey(this.config.networkId, this.accountId, keyPair);
    await this.batchInitialSetup(wallet, publicKey, "0.5");
  }
  /**
   * Batch initial setup: Gas deposit + Session Key
   */
  async batchInitialSetup(wallet, sessionKeyPublicKey, gasAmount) {
    return await wallet.signAndSendTransactions({
      transactions: [
        {
          receiverId: this.config.contractId,
          actions: [
            transactions2.functionCall(
              "deposit_funds",
              Buffer.from(JSON.stringify({})),
              new BN2("30000000000000"),
              // 30 TGas
              new BN2(utils2.format.parseNearAmount(gasAmount) || "0")
            )
          ]
        },
        {
          receiverId: this.accountId,
          actions: [
            transactions2.addKey(
              utils2.PublicKey.from(sessionKeyPublicKey),
              transactions2.functionCallAccessKey(
                this.config.contractId,
                [],
                // All methods allowed
                new BN2(utils2.format.parseNearAmount("0.25") || "0")
                // 0.25 NEAR allowance
              )
            )
          ]
        }
      ]
    });
  }
  async callMethod(method, args, gas = "300000000000000") {
    const keyPair = await this.keyStore.getKey(this.config.networkId, this.accountId);
    if (!keyPair) {
      throw new Error("No session key found. Please setup account first.");
    }
    const near = await connect({
      networkId: this.config.networkId,
      keyStore: this.keyStore,
      nodeUrl: this.config.nodeUrl
    });
    const account = await near.account(this.accountId);
    const outcome = await account.functionCall({
      contractId: this.config.contractId,
      methodName: method,
      args,
      gas: new BN2(gas),
      attachedDeposit: new BN2(0)
    });
    return providers2.getTransactionLastResult(outcome);
  }
  async sendBatchTransaction(actions) {
    const keyPair = await this.keyStore.getKey(this.config.networkId, this.accountId);
    if (!keyPair) {
      throw new Error("No session key found. Please setup account first.");
    }
    const near = await connect({
      networkId: this.config.networkId,
      keyStore: this.keyStore,
      nodeUrl: this.config.nodeUrl
    });
    const account = await near.account(this.accountId);
    const outcome = await account.signAndSendTransaction({
      receiverId: this.config.contractId,
      actions
    });
    return providers2.getTransactionLastResult(outcome);
  }
  // ... helper methods for withdrawing funds can remain strictly if needed, 
  // but they are simple wrappers around wallet calls or callMethod.
};
export {
  DEFAULT_CONFIG,
  LitClient,
  MPCSigner,
  PKPManager,
  SessionManager,
  deriveEthAddress,
  signWithMPC
};
