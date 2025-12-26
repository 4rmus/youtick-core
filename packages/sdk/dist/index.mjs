import {
  __export,
  batchInitialSetup,
  batchUploadActions,
  batchUploadActionsSignless,
  createSessionKeyOnly
} from "./chunk-GAQ5YXQE.mjs";

// src/config.ts
var DEFAULT_CONFIG = {
  networkId: "testnet",
  contractId: "sdk-1-0.utick.testnet",
  nodeUrl: "https://rpc.testnet.fastnear.com",
  litNetwork: "datil-test",
  mpcContractId: "v1.signer-prod.testnet"
};

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

// src/auth/session.ts
import { keyStores, KeyPair, connect, providers, transactions, utils } from "near-api-js";
var SessionManager = class {
  constructor(accountId, config = DEFAULT_CONFIG, keyStore) {
    this.accountId = accountId;
    this.config = config;
    if (keyStore) {
      this.keyStore = keyStore;
    } else if (typeof window !== "undefined" && window.localStorage) {
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
      } else if (permission !== "FullAccess") {
      }
      return true;
    } catch (e) {
      console.warn("Error checking session key on-chain (network issue?). Assuming local key is valid.", e);
      return true;
    }
  }
  async createSessionKey(wallet, gasAmount = "1") {
    const keyPair = KeyPair.fromRandom("ed25519");
    const publicKey = keyPair.getPublicKey().toString();
    await this.keyStore.setKey(this.config.networkId, this.accountId, keyPair);
    if (typeof window !== "undefined") {
      const keyString = keyPair.toString();
      localStorage.setItem(
        `near-api-js:keystore:${this.accountId}:${this.config.networkId}`,
        keyString
      );
      console.log("Session key saved to localStorage:", publicKey);
    }
    if (gasAmount === "0" || parseFloat(gasAmount) === 0) {
      const { createSessionKeyOnly: createSessionKeyOnly2 } = await import("./batch-transactions-PMJHYJLD.mjs");
      await createSessionKeyOnly2(
        wallet,
        this.accountId,
        this.config.contractId,
        publicKey
      );
    } else {
      await batchInitialSetup(
        wallet,
        this.accountId,
        this.config.contractId,
        publicKey,
        gasAmount
      );
    }
  }
  /**
   * Create session key with minimal deposit (for PKP users)
   * PKP users need less gas but still need prepaid for MPC + NFT minting
   */
  async createSessionKeyMinimal(wallet) {
    const keyPair = KeyPair.fromRandom("ed25519");
    const publicKey = keyPair.getPublicKey().toString();
    await this.keyStore.setKey(this.config.networkId, this.accountId, keyPair);
    await batchInitialSetup(
      wallet,
      this.accountId,
      this.config.contractId,
      publicKey,
      "0.5"
      // Covers: MPC signature (0.25) + NFT mint (0.1) + Event (0.1) = 0.45 NEAR + margin
    );
  }
  async saveSessionKey(keyPair) {
    await this.keyStore.setKey(this.config.networkId, this.accountId, keyPair);
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
      gas: BigInt(gas),
      attachedDeposit: BigInt(0)
    });
    const result = providers.getTransactionLastResult(outcome);
    return result;
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
    const result = providers.getTransactionLastResult(outcome);
    return result;
  }
  async getAccountBalance(nodeUrl) {
    try {
      const provider = new providers.JsonRpcProvider({ url: nodeUrl || this.config.nodeUrl });
      const res = await provider.query({
        request_type: "call_function",
        account_id: this.config.contractId,
        method_name: "get_user_balance",
        args_base64: Buffer.from(JSON.stringify({ account_id: this.accountId })).toString("base64"),
        finality: "final"
      });
      const balString = JSON.parse(Buffer.from(res.result).toString());
      return parseFloat(utils.format.formatNearAmount(balString));
    } catch (e) {
      console.warn("Error getting gas balance (maybe not registered?):", e);
      return 0;
    }
  }
  async hasSufficientGas(nodeUrl, minAmount = 1) {
    const currentBalance = await this.getAccountBalance(nodeUrl);
    console.log(`Current Prepaid Gas Balance: ${currentBalance} NEAR, Required: ${minAmount}`);
    return currentBalance >= minAmount;
  }
  async ensureGas(wallet, nodeUrl, minAmount = 1) {
    const sufficient = await this.hasSufficientGas(nodeUrl, minAmount);
    if (!sufficient) {
      console.log(`Low gas, triggering Top Up...`);
      await this.topUpGas(wallet, "1");
    }
  }
  async topUpGas(wallet, amount) {
    console.log(`Topping up gas: ${amount} NEAR`);
    const action = transactions.functionCall(
      "deposit_funds",
      Buffer.from(JSON.stringify({})),
      BigInt("30000000000000"),
      // 30 TGas
      BigInt(utils.format.parseNearAmount(amount) || "0")
    );
    await wallet.signAndSendTransaction({
      receiverId: this.config.contractId,
      actions: [action]
    });
  }
  async withdrawFunds(wallet, amount) {
    console.log(`Withdrawing funds: ${amount} NEAR`);
    const action = transactions.functionCall(
      "withdraw_funds",
      Buffer.from(JSON.stringify({ amount: utils.format.parseNearAmount(amount) || "0" })),
      BigInt("30000000000000"),
      // 30 TGas
      BigInt("1")
      // Attach 1 yocto for security
    );
    await wallet.signAndSendTransaction({
      receiverId: this.config.contractId,
      actions: [action]
    });
  }
  async withdrawFundsSilent(amount) {
    console.log(`Withdrawing funds silently (Session Key): ${amount} NEAR`);
    return await this.callMethod(
      "withdraw_funds_prepaid",
      {},
      "30000000000000"
    );
  }
  async viewMethod(method, args = {}) {
    try {
      const provider = new providers.JsonRpcProvider({ url: this.config.nodeUrl });
      const res = await provider.query({
        request_type: "call_function",
        account_id: this.config.contractId,
        method_name: method,
        args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
        finality: "final"
      });
      return JSON.parse(Buffer.from(res.result).toString());
    } catch (e) {
      console.error(`Error in viewMethod (${method}):`, e);
      throw e;
    }
  }
  async logout() {
    await this.keyStore.removeKey(this.config.networkId, this.accountId);
    if (typeof window !== "undefined") {
      localStorage.removeItem(`near-api-js:keystore:${this.accountId}:${this.config.networkId}`);
    }
  }
};

// src/encryption/lit.ts
var lit_exports = {};
__export(lit_exports, {
  LitClient: () => LitClient
});
import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { LitAbility } from "@lit-protocol/constants";
import { encryptFile, decryptToFile } from "@lit-protocol/encryption";
import {
  createSiweMessageWithRecaps,
  LitAccessControlConditionResource,
  LitPKPResource,
  LitActionResource
} from "@lit-protocol/auth-helpers";
import { ethers } from "ethers";
var LitClient = class {
  constructor(config = DEFAULT_CONFIG, storage) {
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
  async getSessionSigs(wallet, accountId, ethAddress, signWithMPC, derivationPath = "lit/pkp-minting") {
    await this.connect();
    const resource = new LitAccessControlConditionResource("*");
    const sessionSigs = await this.litNodeClient.getSessionSigs({
      chain: "ethereum",
      expiration: new Date(Date.now() + 1e3 * 60 * 60 * 24).toISOString(),
      // 24 hours
      resourceAbilityRequests: [
        {
          resource,
          ability: LitAbility.AccessControlConditionDecryption
        },
        {
          resource,
          ability: LitAbility.AccessControlConditionSigning
        }
      ],
      authNeededCallback: async ({ resourceAbilityRequests, expiration, uri }) => {
        if (!uri || !expiration || !resourceAbilityRequests) {
          throw new Error("Missing required fields in authNeededCallback");
        }
        if (!ethAddress) {
          throw new Error("ethAddress is required");
        }
        const toSign = await createSiweMessageWithRecaps({
          uri,
          expiration,
          resources: resourceAbilityRequests,
          walletAddress: ethAddress,
          nonce: await this.litNodeClient.getLatestBlockhash(),
          litNodeClient: this.litNodeClient
        });
        const mpcSignature = await signWithMPC(wallet, accountId, derivationPath, toSign);
        const r_val = "0x" + mpcSignature.big_r.affine_point.substring(2, 66);
        const s_val = "0x" + mpcSignature.s.scalar;
        let v_val = 27;
        if (typeof mpcSignature.recovery_id === "number") {
          v_val = mpcSignature.recovery_id + 27;
        }
        const signature = ethers.Signature.from({ r: r_val, s: s_val, v: v_val }).serialized;
        let recoveredAddr = ethers.verifyMessage(toSign, signature);
        let validSignature = signature;
        if (recoveredAddr.toLowerCase() !== ethAddress.toLowerCase()) {
          const flippedV = v_val === 27 ? 28 : 27;
          const flippedSignature = ethers.Signature.from({ r: r_val, s: s_val, v: flippedV }).serialized;
          const recoveredFlipped = ethers.verifyMessage(toSign, flippedSignature);
          if (recoveredFlipped.toLowerCase() === ethAddress.toLowerCase()) {
            recoveredAddr = recoveredFlipped;
            validSignature = flippedSignature;
          }
        }
        return {
          sig: validSignature,
          derivedVia: "web3.eth.personal.sign",
          signedMessage: toSign,
          address: ethAddress
        };
      }
    });
    return sessionSigs;
  }
  /**
   * Get session signatures using a PKP (signless experience).
   * Uses Lit Action to verify NEAR signature and authorize the PKP.
   */
  async getSessionSigsWithPKP(pkpPublicKey, pkpEthAddress, nearAccountId, capacityDelegationAuthSig) {
    await this.connect();
    const litActionIpfsCid = this.config.litActionIpfsId || "QmZhqF9xZAJTTRyUR4d5L1zt83MByXaXUQuaU3a7gKdsh6";
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
    } else if (authSig) {
      params.authSig = authSig;
    } else {
      throw new Error("Either authSig or sessionSigs must be provided for encryption");
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
    } else if (authSig) {
      params.authSig = authSig;
    } else {
      throw new Error("Either authSig or sessionSigs must be provided for decryption");
    }
    return await decryptToFile(params, this.litNodeClient);
  }
  get client() {
    return this.litNodeClient;
  }
};

// src/storage/lighthouse.ts
import lighthouse from "@lighthouse-web3/sdk";
var LighthouseClient = class {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }
  /**
   * Upload file to Lighthouse
   * Uses direct API call for browser compatibility
   */
  async uploadFile(file) {
    if (typeof window !== "undefined" && file instanceof File) {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("https://upload.lighthouse.storage/api/v0/add", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`
        },
        body: formData
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Lighthouse upload failed (${response.status}): ${errorText || response.statusText}`);
      }
      const data = await response.json();
      return { data };
    }
    const uploadResponse = await lighthouse.upload(
      file,
      this.apiKey
    );
    return uploadResponse;
  }
  /**
   * Upload encrypted file to Lighthouse
   */
  async uploadEncryptedFile(file, publicKey, signedMessage, uploadProgressCallback) {
    const response = await lighthouse.uploadEncrypted(
      file,
      this.apiKey,
      publicKey,
      signedMessage,
      uploadProgressCallback
    );
    return response;
  }
  /**
   * Apply access conditions to encrypted file
   */
  async applyAccessConditions(cid, conditions, publicKey, signedMessage, aggregator = "([1])", chainType = "EVM") {
    const response = await lighthouse.applyAccessCondition(
      publicKey,
      cid,
      signedMessage,
      conditions,
      aggregator,
      chainType
    );
    return response;
  }
  async getAuthMessage(publicKey) {
    return await lighthouse.getAuthMessage(publicKey);
  }
};

// src/utils/mpc.ts
import { ethers as ethers2 } from "ethers";
import { providers as providers2, utils as utils2 } from "near-api-js";
import { ec as EC } from "elliptic";
import BN from "bn.js";
import { sha3_256 } from "js-sha3";
var DEFAULT_MPC_CONTRACT = "v1.signer-prod.testnet";
var DEFAULT_DERIVATION_PATH = "youtick,1";
async function deriveEthAddress(accountId, path = DEFAULT_DERIVATION_PATH, config = DEFAULT_CONFIG) {
  const mpcContract = config.mpcContractId || DEFAULT_MPC_CONTRACT;
  const cacheKey = `mpc_address_v8_${accountId}_${path}_${mpcContract}`;
  if (typeof window !== "undefined") {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      return cached;
    }
  }
  const provider = new providers2.JsonRpcProvider({ url: config.nodeUrl });
  let masterKey;
  try {
    const result = await provider.query({
      request_type: "call_function",
      account_id: mpcContract,
      method_name: "public_key",
      args_base64: Buffer.from("{}").toString("base64"),
      finality: "final"
    });
    const keyBytes = result.result;
    const rawString = String.fromCharCode(...keyBytes);
    masterKey = JSON.parse(rawString);
  } catch (e) {
    console.error("Failed to fetch MPC master key, falling back to known testnet key:", e);
    masterKey = "secp256k1:4HFcTSodRLVCGNVreQW2nRoAT1g8jU6db747155tYf49P7c5t578D5588C889988";
  }
  const derivedKey = deriveChildKey(masterKey, accountId, path);
  const derivedPoint = derivedKey.replace(/^secp256k1:/, "");
  const address = ethers2.computeAddress("0x" + derivedPoint);
  if (typeof window !== "undefined") {
    localStorage.setItem(cacheKey, address);
  }
  return address;
}
function deriveChildKey(masterKeyStr, accountId, path) {
  const ec = new EC("secp256k1");
  const masterKeyBase58 = masterKeyStr.replace("secp256k1:", "");
  const masterKeyBytes = utils2.serialize.base_decode(masterKeyBase58);
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

// src/core/client.ts
import { ethers as ethers3 } from "ethers";
import { utils as utils3 } from "near-api-js";
var YoutickClient = class {
  constructor(accountId, lighthouseApiKey = "", config = DEFAULT_CONFIG) {
    this.config = config;
    this.session = new SessionManager(accountId, config);
    this.lit = new LitClient(config);
    this.lighthouse = new LighthouseClient(lighthouseApiKey);
  }
  /**
   * Publish a video: Encrypt -> Upload -> Mint
   * @param file Video file to upload
   * @param metadata Title, price, description
   */
  async publishVideo(file, metadata) {
    const hasSession = await this.session.hasSessionKey();
    if (!hasSession) {
      throw new Error("Session key not found. Please create one first.");
    }
    const derivationPath = "lit/pkp-minting";
    const ethAddress = await deriveEthAddress(this.config.contractId, derivationPath);
    const videoUuid = crypto.randomUUID();
    const accessControlConditions = [
      {
        conditionType: "evmBasic",
        contractAddress: "",
        standardContractType: "",
        chain: "ethereum",
        method: "eth_getBalance",
        parameters: [":userAddress", "latest"],
        returnValueTest: {
          key: "",
          comparator: ">=",
          value: "0"
        }
      }
    ];
    const signWithMPC = async (w, accId, path, msg) => {
      const messageHash = ethers3.hashMessage(msg);
      const payload = Array.from(ethers3.getBytes(messageHash));
      return await this.session.callMethod("sign_with_mpc", {
        payload,
        path,
        key_version: 0
      });
    };
    const sessionSigs = await this.lit.getSessionSigs(
      null,
      // wallet not needed for session key call
      this.session["accountId"],
      // Accessing private property using key or getter if available? User ID.
      ethAddress,
      signWithMPC,
      derivationPath
    );
    const { ciphertext, dataToEncryptHash } = await this.lit.encryptFile(
      file,
      accessControlConditions,
      void 0,
      "ethereum",
      sessionSigs
    );
    const encryptedContent = {
      ciphertext,
      dataToEncryptHash,
      accessControlConditions
    };
    const metadataBlob = new Blob([JSON.stringify(encryptedContent)], { type: "application/json" });
    const encryptedFile = new File([metadataBlob], file.name + ".json", { type: "application/json" });
    const uploadResponse = await this.lighthouse.uploadFile(encryptedFile);
    const fileHash = uploadResponse.data.Hash || (Array.isArray(uploadResponse.data) ? uploadResponse.data[0].Hash : null);
    if (!fileHash) throw new Error("Upload failed, no hash returned");
    const eventTitle = `${fileHash}:::${metadata.thumbnailCid || ""}:::${metadata.title}`;
    const mediaUrl = `https://gateway.lighthouse.storage/ipfs/${metadata.thumbnailCid || ""}`;
    const videoMetadata = {
      receiver_id: this.session["accountId"],
      token_metadata: {
        title: eventTitle,
        description: metadata.description,
        media: mediaUrl,
        copies: 1
      },
      video_metadata: {
        encrypted_cid: videoUuid,
        livepeer_playback_id: "",
        duration_seconds: 0,
        content_type: "Exclusive"
      }
    };
    const eventMetadata = {
      encrypted_cid: videoUuid,
      title: eventTitle,
      description: metadata.description,
      price: utils3.format.parseNearAmount(metadata.price) || "0",
      livepeer_playback_id: ""
    };
    await batchUploadActionsSignless(
      this.session,
      videoMetadata,
      eventMetadata
    );
    return {
      tokenId: videoUuid,
      // TODO: Get actual token ID from event?
      cid: fileHash
    };
  }
};

// src/contract/youtick.ts
var youtick_exports = {};
__export(youtick_exports, {
  YouTickContract: () => YouTickContract
});
var YouTickContract = class {
  constructor(account, contractId = DEFAULT_CONFIG.contractId) {
    this.account = account;
    this.contractId = contractId;
  }
  async createEvent(event, storageDeposit = "0.1") {
    return await this.account.functionCall({
      contractId: this.contractId,
      methodName: "create_event",
      args: event,
      attachedDeposit: BigInt(storageDeposit)
      // 0.1 NEAR default
    });
  }
  async createEventPrepaid(event) {
    return await this.account.functionCall({
      contractId: this.contractId,
      methodName: "create_event_prepaid",
      args: event,
      attachedDeposit: BigInt(0)
    });
  }
  async buyTicket(encryptedCid, priceCushion = "0.01", attachedDeposit) {
    return await this.account.functionCall({
      contractId: this.contractId,
      methodName: "buy_ticket",
      args: {
        receiver_id: this.account.accountId,
        encrypted_cid: encryptedCid
      },
      attachedDeposit: BigInt(attachedDeposit)
    });
  }
  async buyTicketPrepaid(encryptedCid) {
    return await this.account.functionCall({
      contractId: this.contractId,
      methodName: "buy_ticket_prepaid",
      args: {
        receiver_id: this.account.accountId,
        encrypted_cid: encryptedCid
      },
      attachedDeposit: BigInt(0)
    });
  }
  /**
   * Request MPC signature via Proxy
   */
  async signWithMPC(payload, path, keyVersion = 0) {
    return await this.account.functionCall({
      contractId: this.contractId,
      methodName: "sign_with_mpc",
      args: { payload, path, key_version: keyVersion },
      attachedDeposit: BigInt(0),
      // Uses prepaid balance
      gas: BigInt("300000000000000")
      // 300 TGas
    });
  }
  // View functions
  async getEvents(fromIndex = 0, limit = 50) {
    return await this.account.viewFunction({
      contractId: this.contractId,
      methodName: "get_events",
      args: { from_index: fromIndex.toString(), limit }
    });
  }
  async getTokenWithVideo(accountId) {
    return await this.account.viewFunction({
      contractId: this.contractId,
      methodName: "get_tokens_with_video",
      args: { account_id: accountId }
    });
  }
};
export {
  DEFAULT_CONFIG,
  LighthouseClient,
  lit_exports as Lit,
  LitClient,
  MemoryStorage,
  youtick_exports as Near,
  SessionManager,
  YouTickContract,
  YoutickClient,
  batchInitialSetup,
  batchUploadActions,
  batchUploadActionsSignless,
  createSessionKeyOnly,
  deriveEthAddress
};
