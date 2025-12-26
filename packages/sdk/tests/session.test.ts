import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionManager, DEFAULT_CONFIG } from '../src/index';

// Mock near-api-js
vi.mock('near-api-js', () => ({
    keyStores: {
        BrowserLocalStorageKeyStore: vi.fn().mockImplementation(() => ({
            getKey: vi.fn(),
            setKey: vi.fn(),
            removeKey: vi.fn()
        })),
        InMemoryKeyStore: vi.fn().mockImplementation(() => ({
            getKey: vi.fn(),
            setKey: vi.fn(),
            removeKey: vi.fn()
        }))
    },
    KeyPair: {
        fromRandom: vi.fn().mockReturnValue({
            getPublicKey: () => ({ toString: () => 'ed25519:MockPublicKey123' })
        })
    },
    connect: vi.fn(),
    providers: {
        getTransactionLastResult: vi.fn(),
        JsonRpcProvider: vi.fn()
    },
    utils: {
        format: {
            parseNearAmount: vi.fn((amount: string) => amount + '000000000000000000000000'),
            formatNearAmount: vi.fn((amount: string) => '1.0')
        },
        PublicKey: {
            from: vi.fn()
        }
    }
}));

describe('SessionManager', () => {
    let sessionManager: SessionManager;
    const testAccountId = 'test.testnet';

    beforeEach(() => {
        sessionManager = new SessionManager(testAccountId, DEFAULT_CONFIG);
    });

    describe('constructor', () => {
        it('should create a SessionManager with default config', () => {
            expect(sessionManager).toBeDefined();
        });

        it('should use provided config', () => {
            const customConfig = {
                ...DEFAULT_CONFIG,
                contractId: 'custom.testnet'
            };
            const sm = new SessionManager(testAccountId, customConfig);
            expect(sm).toBeDefined();
        });
    });

    describe('hasSessionKey', () => {
        it('should return false when no key exists locally', async () => {
            // Mock keyStore to return null
            const mockKeyStore = {
                getKey: vi.fn().mockResolvedValue(null),
                setKey: vi.fn(),
                removeKey: vi.fn()
            };
            const sm = new SessionManager(testAccountId, DEFAULT_CONFIG, mockKeyStore as any);

            const result = await sm.hasSessionKey();
            expect(result).toBe(false);
        });
    });

    describe('callMethod', () => {
        it('should throw error when no session key exists', async () => {
            const mockKeyStore = {
                getKey: vi.fn().mockResolvedValue(null),
                setKey: vi.fn(),
                removeKey: vi.fn()
            };
            const sm = new SessionManager(testAccountId, DEFAULT_CONFIG, mockKeyStore as any);

            await expect(sm.callMethod('test_method', {})).rejects.toThrow(
                'No session key found'
            );
        });
    });
});

describe('DEFAULT_CONFIG', () => {
    it('should have correct testnet configuration', () => {
        expect(DEFAULT_CONFIG.networkId).toBe('testnet');
        expect(DEFAULT_CONFIG.contractId).toBe('sdk-1-0.utick.testnet');
        expect(DEFAULT_CONFIG.litNetwork).toBe('datil-test');
    });
});
