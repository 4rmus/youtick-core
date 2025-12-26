var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/utils/batch-transactions.ts
import { utils } from "near-api-js";
async function batchUploadActions(wallet, contractId, accountId, videoMetadata, eventMetadata) {
  const actions = [
    // Action 1: Mint NFT (no deposit needed, uses prepaid pattern)
    {
      type: "FunctionCall",
      params: {
        methodName: "nft_mint_prepaid",
        args: videoMetadata,
        gas: "100000000000000",
        // 100 TGas
        deposit: "0"
        // No deposit attached (uses internal balance)
      }
    },
    // Action 2: Create Event (requires storage deposit)
    {
      type: "FunctionCall",
      params: {
        methodName: "create_event",
        args: eventMetadata,
        gas: "30000000000000",
        // 30 TGas
        deposit: utils.format.parseNearAmount("0.1") || "0"
        // 0.1 NEAR storage deposit
      }
    }
  ];
  return await wallet.signAndSendTransaction({
    receiverId: contractId,
    actions
  });
}
async function batchInitialSetup(wallet, accountId, contractId, sessionKeyPublicKey, gasAmount = "1") {
  return await wallet.signAndSendTransactions({
    transactions: [
      {
        receiverId: contractId,
        actions: [
          {
            type: "FunctionCall",
            params: {
              methodName: "deposit_funds",
              args: {},
              gas: "30000000000000",
              // 30 TGas
              deposit: utils.format.parseNearAmount(gasAmount) || "0"
            }
          }
        ]
      },
      {
        receiverId: accountId,
        actions: [
          {
            type: "AddKey",
            params: {
              publicKey: sessionKeyPublicKey,
              accessKey: {
                permission: {
                  receiverId: contractId,
                  methodNames: [],
                  // All methods allowed
                  allowance: utils.format.parseNearAmount("0.25") || void 0
                }
              }
            }
          }
        ]
      }
    ]
  });
}
async function batchUploadActionsSignless(sessionManager, videoMetadata, eventMetadata) {
  console.log("Action 1: Minting NFT (Signless)...");
  await sessionManager.callMethod("nft_mint_prepaid", videoMetadata);
  console.log("Action 2: Creating Event (Signless)...");
  return await sessionManager.callMethod("create_event_prepaid", {
    encrypted_cid: eventMetadata.encrypted_cid,
    title: eventMetadata.title,
    description: eventMetadata.description,
    price: eventMetadata.price,
    livepeer_playback_id: ""
  });
}
async function createSessionKeyOnly(wallet, accountId, contractId, sessionKeyPublicKey) {
  return await wallet.signAndSendTransaction({
    receiverId: accountId,
    actions: [
      {
        type: "AddKey",
        params: {
          publicKey: sessionKeyPublicKey,
          accessKey: {
            permission: {
              receiverId: contractId,
              methodNames: [],
              // All methods allowed
              allowance: utils.format.parseNearAmount("0.25") || void 0
            }
          }
        }
      }
    ]
  });
}

export {
  __export,
  batchUploadActions,
  batchInitialSetup,
  batchUploadActionsSignless,
  createSessionKeyOnly
};
