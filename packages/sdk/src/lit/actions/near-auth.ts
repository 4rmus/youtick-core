
// Lit Action code that will be executed on Lit nodes
// Uses tweetnacl for Ed25519 signature verification
export const NEAR_AUTH_LIT_ACTION_CODE = `
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

export const NEAR_AUTH_LIT_ACTION_BASE64 = typeof Buffer !== 'undefined'
    ? Buffer.from(NEAR_AUTH_LIT_ACTION_CODE).toString('base64')
    : btoa(NEAR_AUTH_LIT_ACTION_CODE);

export function generateAuthMessage(nearAccountId: string): string {
    const timestamp = new Date().toISOString();
    return `I authorize Lit Protocol PKP for account ${nearAccountId} at ${timestamp}`;
}
