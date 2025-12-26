import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LitClient, DEFAULT_CONFIG } from '../src/index';

// Mock Lit Protocol
vi.mock('@lit-protocol/lit-node-client', () => ({
    LitNodeClient: vi.fn().mockImplementation(() => ({
        ready: false,
        connect: vi.fn().mockResolvedValue(undefined),
        getLatestBlockhash: vi.fn().mockResolvedValue('mockhash'),
        getSessionSigs: vi.fn().mockResolvedValue({ mockSig: true }),
        getLitActionSessionSigs: vi.fn().mockResolvedValue({ mockSig: true })
    }))
}));

vi.mock('@lit-protocol/encryption', () => ({
    encryptFile: vi.fn().mockResolvedValue({
        ciphertext: 'mockCiphertext',
        dataToEncryptHash: 'mockHash'
    }),
    decryptToFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]))
}));

describe('LitClient', () => {
    let litClient: LitClient;

    beforeEach(() => {
        litClient = new LitClient(DEFAULT_CONFIG);
    });

    describe('constructor', () => {
        it('should create a LitClient with default config', () => {
            expect(litClient).toBeDefined();
        });

        it('should use provided config', () => {
            const customConfig = {
                ...DEFAULT_CONFIG,
                litNetwork: 'datil' as const
            };
            const lc = new LitClient(customConfig);
            expect(lc).toBeDefined();
        });
    });

    describe('connect', () => {
        it('should connect to Lit network', async () => {
            await expect(litClient.connect()).resolves.not.toThrow();
        });
    });

    describe('client getter', () => {
        it('should return the LitNodeClient instance', () => {
            expect(litClient.client).toBeDefined();
        });
    });
});
