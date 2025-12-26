// Lit Action code to be uploaded to IPFS
// This code runs inside Lit Protocol nodes and checks NEAR NFT ownership

export const LIT_ACTION_CODE = `
(async () => {
    // 1. Extract params
    let targetCid, nearAccountId;
    
    try {
        if (typeof jsParams !== 'undefined') {
            targetCid = jsParams.targetCid;
            nearAccountId = jsParams.nearAccountId;
        }
        
        // Fallback: Check if injected as globals
        if (!targetCid && typeof globalThis !== 'undefined') {
            if (globalThis.targetCid) targetCid = globalThis.targetCid;
            if (globalThis.nearAccountId) nearAccountId = globalThis.nearAccountId;
        }
    } catch (e) {
        console.log("Error extracting params:", e);
    }
    
    console.log("Lit Action: Checking access for:", nearAccountId, "targetCid:", targetCid);
    
    if (!nearAccountId || !targetCid) {
        Lit.Actions.setResponse({ response: JSON.stringify({ hasAccess: false, error: "Missing params" }) });
        return;
    }
    
    // 2. Query NEAR Smart Contract
    const rpcUrl = "https://rpc.testnet.near.org";
    const contractId = "v1-0-0.utick.testnet";  // UPDATED CONTRACT ID
    
    try {
        const args = JSON.stringify({ account_id: nearAccountId, limit: 100 });
        const argsBase64 = btoa(args);
        const body = JSON.stringify({
            jsonrpc: "2.0", 
            id: "dontcare", 
            method: "query",
            params: {
                request_type: "call_function", 
                finality: "final",
                account_id: contractId, 
                method_name: "get_tokens_with_video",
                args_base64: argsBase64
            }
        });
        
        // Timeout control for RPC fetch
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const resp = await fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!resp.ok) {
            throw new Error("RPC Error: " + resp.status);
        }
        
        const data = await resp.json();
        if (data.error) {
            Lit.Actions.setResponse({ response: JSON.stringify({ hasAccess: false, error: "RPC error: " + JSON.stringify(data.error) }) });
            return;
        }
        
        const resultBytes = data.result.result;
        const resultStr = String.fromCharCode(...resultBytes);
        const tokensWithVideo = JSON.parse(resultStr);
        
        // Check if user has a ticket for this specific video (by encrypted_cid)
        const hasTicket = tokensWithVideo.some(([token, metadata]) => {
            return metadata && metadata.encrypted_cid === targetCid;
        });
        
        console.log("Lit Action: hasTicket =", hasTicket, "for targetCid =", targetCid);
        
        if (hasTicket) {
            Lit.Actions.setResponse({
                response: JSON.stringify({
                    hasAccess: true,
                    nearAccountId: nearAccountId,
                    targetCid: targetCid
                })
            });
        } else {
            Lit.Actions.setResponse({ response: JSON.stringify({ hasAccess: false, error: "No ticket found for this video" }) });
        }
    } catch (e) {
        Lit.Actions.setResponse({ response: JSON.stringify({ hasAccess: false, error: e.toString() }) });
    }
})();
`;

// CID for the above code (hardcoded for now, but in reality should be calculated or passed in config)
export const LIT_ACTION_CID = "QmZhqF9xZAJTTRyUR4d5L1zt83MByXaXUQuaU3a7gKdsh6";
