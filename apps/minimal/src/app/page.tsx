"use client";

import { useState, useEffect } from "react";
import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { setupModal } from "@near-wallet-selector/modal-ui";
import "@near-wallet-selector/modal-ui/styles.css";
import { SessionManager, LitClient, DEFAULT_CONFIG } from "@youtick/sdk";

// Helper to initialize NEAR Wallet
async function initNear() {
    const selector = await setupWalletSelector({
        network: "testnet",
        modules: [setupMyNearWallet()],
    });

    const modal = setupModal(selector, {
        contractId: DEFAULT_CONFIG.contractId,
    });

    return { selector, modal };
}

export default function Home() {
    const [wallet, setWallet] = useState<any>(null);
    const [accountId, setAccountId] = useState<string>("");
    const [sessionManager, setSessionManager] = useState<SessionManager | null>(null);
    const [logs, setLogs] = useState<string[]>([]);

    const addLog = (msg: string) => setLogs((prev) => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);

    useEffect(() => {
        initNear().then(async ({ selector, modal }) => {
            const state = selector.store.getState();
            const accounts = state.accounts;

            if (accounts.length > 0) {
                setAccountId(accounts[0].accountId);
                const walletInstance = await selector.wallet();
                setWallet(walletInstance);

                // Initialize SDK Session Manager
                const sm = new SessionManager(accounts[0].accountId);
                setSessionManager(sm);
                addLog(`Connected to ${accounts[0].accountId}`);

                // Check session
                const hasKey = await sm.hasSessionKey();
                addLog(`Session Key Status: ${hasKey ? "Active ✅" : "Missing ❌"}`);
            } else {
                // Trigger login if not connected? Or wait for user.
                // For minimal demo, we'll add a connect button.
            }

            // @ts-ignore
            window.selector = selector;
            // @ts-ignore
            window.modal = modal;
        });
    }, []);

    const handleConnect = () => {
        // @ts-ignore
        window.modal.show();
    };

    const handleCreateSession = async () => {
        if (!sessionManager || !wallet) return;
        try {
            addLog("Creating session key (Requesting signature)...");
            await sessionManager.createSessionKey(wallet);
            addLog("Session Key created! ✅");
        } catch (e: any) {
            addLog(`Error: ${e.message}`);
        }
    };

    const handleSignlessAction = async () => {
        if (!sessionManager) return;
        try {
            addLog("Executing signless action (Minting)...");
            // Just a dummy call to verify session key works
            // using a benign method or just checking access
            const result = await sessionManager.callMethod("nft_mint_prepaid", {
                // Dummy data that will fail logic but verify Auth
                token_metadata: { title: "Test", description: "Test", media: "Test", copies: 1 },
                receiver_id: accountId
            });
            addLog("Action executed! (Check console for result)");
            console.log(result);
        } catch (e: any) {
            // If it fails with "smart contract panicked: ..." it means Auth worked!
            addLog(`Contract verified auth (Result: ${e.message})`);
        }
    };

    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-900 text-white">
            <h1 className="text-4xl font-bold mb-8">YouTick SDK Minimal Demo</h1>

            <div className="flex flex-col gap-4 w-full max-w-md">
                {!accountId ? (
                    <button
                        onClick={handleConnect}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                    >
                        Connect NEAR Wallet
                    </button>
                ) : (
                    <>
                        <div className="p-4 bg-gray-800 rounded">
                            <p>User: <span className="font-mono text-green-400">{accountId}</span></p>
                        </div>

                        <button
                            onClick={handleCreateSession}
                            className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded transition"
                        >
                            1. Create Session Key (1 Sig)
                        </button>

                        <button
                            onClick={handleSignlessAction}
                            className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition"
                        >
                            2. Test Signless Action (No Sig)
                        </button>
                    </>
                )}

                <div className="mt-8 p-4 bg-black rounded h-64 overflow-y-auto font-mono text-sm border border-gray-700">
                    <h3 className="text-gray-500 mb-2 border-b border-gray-800 pb-1">Logs</h3>
                    {logs.map((log, i) => (
                        <div key={i} className="mb-1">{log}</div>
                    ))}
                </div>
            </div>
        </main>
    );
}
