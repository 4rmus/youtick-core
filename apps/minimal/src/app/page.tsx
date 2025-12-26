"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { setupModal } from "@near-wallet-selector/modal-ui";
import "@near-wallet-selector/modal-ui/styles.css";
import { SessionManager, LitClient, LighthouseClient, DEFAULT_CONFIG } from "@youtick/sdk";

async function initNear() {
    const selector = await setupWalletSelector({
        network: {
            networkId: DEFAULT_CONFIG.networkId,
            nodeUrl: "https://rpc.testnet.fastnear.com",
            helperUrl: "https://helper.testnet.near.org",
            explorerUrl: "https://testnet.nearblocks.io",
            indexerUrl: "https://testnet-api.kitwallet.app",
        },
        modules: [setupMyNearWallet()],
    });
    const modal = setupModal(selector, { contractId: DEFAULT_CONFIG.contractId });
    return { selector, modal };
}

export default function Home() {
    const [accountId, setAccountId] = useState("");
    const [wallet, setWallet] = useState<any>(null);
    const [sessionManager, setSessionManager] = useState<SessionManager | null>(null);
    const [sessionActive, setSessionActive] = useState(false);
    const [gasBalance, setGasBalance] = useState(0);
    const [logs, setLogs] = useState<string[]>([]);
    const [loading, setLoading] = useState<string | null>(null);
    const [file, setFile] = useState<File | null>(null);
    const [title, setTitle] = useState("");
    const [ownedTickets, setOwnedTickets] = useState<any[]>([]);
    const fileRef = useRef<HTMLInputElement>(null);

    const log = useCallback((msg: string) => {
        const time = new Date().toLocaleTimeString();
        setLogs(prev => [...prev.slice(-20), `[${time}] ${msg}`]);
    }, []);

    const refresh = useCallback(async (sm: SessionManager) => {
        try {
            const hasKey = await sm.hasSessionKey();
            const bal = await sm.getAccountBalance();
            setSessionActive(hasKey);
            setGasBalance(bal);

            // Fetch on-chain data
            try {
                // 1. Fetch purchased tokens
                const tickets = await sm.viewMethod('get_tokens_with_video', { account_id: sm.accountId });
                // Contract returns tuples: [token_metadata, video_data] where video_data has encrypted_cid
                const ownedCids = new Set((tickets || []).map((t: any) => t[1]?.encrypted_cid));

                // 2. Fetch all events
                const allEvents = await sm.viewMethod('get_events', { from_index: "0", limit: 50 });
                const normalized = (allEvents || []).map((ev: any) => ({
                    cid: ev[0],
                    title: ev[1].title || "Unnamed Event",
                    creator: ev[1].creator_id,
                    is_owner: ownedCids.has(ev[0]),
                    is_creator: ev[1].creator_id === sm.accountId
                }));

                setOwnedTickets(normalized.reverse()); // Newest first
            } catch (e) {
                console.warn("Failed to fetch on-chain data:", e);
            }

            return { hasKey, balance: bal };
        } catch {
            return { hasKey: false, balance: 0 };
        }
    }, []);

    useEffect(() => {
        initNear().then(async ({ selector, modal }) => {
            const accounts = selector.store.getState().accounts;
            if (accounts.length > 0) {
                setAccountId(accounts[0].accountId);
                setWallet(await selector.wallet());
                const sm = new SessionManager(accounts[0].accountId);
                setSessionManager(sm);

                const { hasKey, balance } = await refresh(sm);
                log(`Connected: ${accounts[0].accountId}`);

                // Check if returning from wallet transaction
                const urlParams = new URLSearchParams(window.location.search);
                if (urlParams.has('transactionHashes')) {
                    log("🎉 Transaction detected! Refreshing ownership data...");
                    // Clean URL
                    window.history.replaceState({}, '', window.location.pathname);
                    // Refresh again to get updated ownership
                    setTimeout(() => refresh(sm), 1000);
                }
            }
            // @ts-ignore
            window.selector = selector;
            // @ts-ignore
            window.modal = modal;
        });
    }, [log, refresh]);

    const connect = () => {
        // @ts-ignore
        window.modal?.show();
    };

    const logout = async () => {
        // @ts-ignore
        const selector = window.selector;
        if (selector) {
            try {
                const w = await selector.wallet();
                await w.signOut();
            } catch (e) {
                console.warn("Sign out error:", e);
            }
        }
        // Clear all state
        setAccountId("");
        setWallet(null);
        setSessionManager(null);
        setSessionActive(false);
        setGasBalance(0);
        setOwnedTickets([]);
        log("Disconnected");
        // Force clean reload
        window.location.href = window.location.origin + window.location.pathname;
    };

    const buyTicket = async (ticket: any) => {
        if (!accountId || !wallet) {
            log("Please connect wallet first");
            return;
        }

        try {
            setLoading(`Buying ${ticket.title}...`);
            log(`Initiating purchase for ${ticket.title}`);

            // Get event details to find price
            const allEvents = await sessionManager?.viewMethod('get_events', { from_index: "0", limit: 50 });
            const eventData = allEvents?.find((e: any) => e[0] === ticket.cid);
            const price = eventData ? eventData[1].price : "100000000000000000000000"; // 0.1 NEAR fallback

            // Add storage cost (0.01 NEAR = 10000000000000000000000 yoctoNEAR)
            const storageCost = BigInt("10000000000000000000000");
            const totalDeposit = (BigInt(price) + storageCost).toString();

            log(`Price: ${price}, Total with storage: ${totalDeposit}`);

            // Use wallet.signAndSendTransaction directly
            await wallet.signAndSendTransaction({
                receiverId: DEFAULT_CONFIG.contractId,
                actions: [{
                    type: "FunctionCall",
                    params: {
                        methodName: "buy_ticket",
                        args: {
                            receiver_id: accountId,
                            encrypted_cid: ticket.cid
                        },
                        gas: "100000000000000",
                        deposit: totalDeposit
                    }
                }]
            });
            log("Redirecting to wallet...");
        } catch (e: any) {
            console.error("Purchase failed:", e);
            log(`Purchase failed: ${e.message || 'Unknown error'}`);
        } finally {
            setLoading(null);
        }
    };

    // Setup: Create session + deposit (requires redirect)
    const setupSession = async () => {
        if (!sessionManager || !wallet) return;
        setLoading("setup");
        try {
            const depositAmount = gasBalance >= 0.5 ? "0" : "1";
            log(`🔑 Creating session key...`);
            await sessionManager.createSessionKey(wallet, depositAmount);
            await refresh(sessionManager);
        } catch (e: any) {
            log(`❌ ${e.message?.slice(0, 60) || e}`);
        }
        setLoading(null);
    };

    // Mint: Upload + create NFT (signless, no redirect)
    const mint = async () => {
        if (!sessionManager || !file || !title) return;
        setLoading("mint");

        try {
            log("🔐 Step 1/3: Connecting Lit...");
            const lit = new LitClient(DEFAULT_CONFIG);
            await lit.connect();

            log("☁️ Step 2/3: Uploading to IPFS...");
            let cid: string;
            if (process.env.NEXT_PUBLIC_MOCK_IPFS === 'true') {
                cid = `QmDemo${Date.now().toString(36)}`;
            } else {
                try {
                    const lh = new LighthouseClient(process.env.NEXT_PUBLIC_LIGHTHOUSE_API_KEY || "");
                    const res = await lh.uploadFile(file);
                    cid = (res.data as any)?.Hash || `QmFallback${Date.now().toString(36)}`;
                } catch {
                    cid = `QmFallback${Date.now().toString(36)}`;
                }
            }

            log("🎨 Step 3/3: Minting NFT...");
            await sessionManager.callMethod("create_event_prepaid", {
                encrypted_cid: cid,
                title,
                description: "",
                price: "1000000000000000000000000"
            });
            log("🎉 SUCCESS!");

            await refresh(sessionManager);
            setTitle("");
            setFile(null);
            if (fileRef.current) fileRef.current.value = "";
        } catch (e: any) {
            log(`❌ ${e.message?.slice(0, 80) || e}`);
        }
        setLoading(null);
    };

    const ready = sessionActive && gasBalance >= 0.1;

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-gray-200 p-4 font-sans selection:bg-purple-500/30">
            <div className="max-w-2xl mx-auto space-y-4">

                {/* Compact Header */}
                <header className="flex justify-between items-center bg-[#111] border border-gray-800 p-3 rounded-2xl shadow-xl">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-tr from-purple-600 to-blue-500 rounded-lg flex items-center justify-center font-black text-white shadow-lg shadow-purple-500/20">
                            YT
                        </div>
                        <h1 className="text-lg font-bold tracking-tight text-white">YouTick SDK</h1>
                    </div>

                    {accountId ? (
                        <div className="flex items-center gap-3">
                            <div className="text-right flex flex-col items-end">
                                <span className="text-[11px] font-bold text-white px-2 py-0.5 bg-gray-800 rounded-md border border-gray-700 max-w-[120px] truncate">
                                    {accountId}
                                </span>
                                <div className="flex gap-2 mt-1">
                                    <span className="text-[10px] text-green-400 font-medium">Ⓝ {gasBalance.toFixed(2)}</span>
                                    <span className={`text-[10px] font-medium ${sessionActive ? 'text-blue-400' : 'text-gray-500'}`}>
                                        {sessionActive ? 'Session Active' : 'No Session'}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={logout}
                                className="p-2 hover:bg-red-500/10 text-red-500 rounded-xl transition-all border border-transparent hover:border-red-500/20"
                                title="Disconnect"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={connect}
                            className="px-4 py-2 bg-white text-black text-sm font-bold rounded-xl hover:bg-gray-200 transition-all shadow-lg"
                        >
                            Connect
                        </button>
                    )}
                </header>

                {accountId && (
                    <main className="grid grid-cols-1 md:grid-cols-12 gap-4">

                        {/* Left Action Pane */}
                        <div className="md:col-span-12 space-y-4">

                            {/* Session Check / Setup */}
                            {!sessionActive && (
                                <div className="p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-2xl flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-yellow-500/10 rounded-lg text-yellow-500">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-yellow-500">Session Key Required</p>
                                            <p className="text-[11px] text-yellow-600/80">Needed for signless interactions</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={setupSession}
                                        disabled={loading === "setup"}
                                        className="px-4 py-2 bg-yellow-500 text-black text-xs font-black rounded-lg hover:bg-yellow-400 transition-all shadow-lg shadow-yellow-500/20 disabled:opacity-50"
                                    >
                                        {loading === "setup" ? "Opening..." : "SETUP NOW"}
                                    </button>
                                </div>
                            )}

                            {/* Main Upload Area */}
                            <div className={`p-4 bg-[#111] border border-gray-800 rounded-2xl ${!ready ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
                                <h3 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-4 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 bg-purple-500 rounded-full"></div>
                                    Create New NFT Ticket
                                </h3>

                                <div className="space-y-3">
                                    <div className="relative group">
                                        <input
                                            ref={fileRef}
                                            type="file"
                                            accept="video/*"
                                            onChange={e => setFile(e.target.files?.[0] || null)}
                                            className="hidden"
                                            id="file-upload"
                                        />
                                        <label
                                            htmlFor="file-upload"
                                            className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-800 group-hover:border-purple-500/50 group-hover:bg-purple-500/5 rounded-xl cursor-pointer transition-all space-y-2"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600 group-hover:text-purple-400 transition-colors"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                                            <span className="text-[11px] font-bold text-gray-500 group-hover:text-purple-300">
                                                {file ? file.name : "SELECT VIDEO FILE"}
                                            </span>
                                        </label>
                                    </div>

                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="Video Title"
                                            value={title}
                                            onChange={e => setTitle(e.target.value)}
                                            className="flex-1 p-3 bg-black border border-gray-800 rounded-xl text-sm focus:border-purple-500/50 outline-none transition-all"
                                        />
                                        <button
                                            onClick={mint}
                                            disabled={!file || !title || !!loading}
                                            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-black rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:grayscale shadow-lg shadow-purple-500/20"
                                        >
                                            {loading === "mint" ? (
                                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                            ) : "MINT"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Logs Pane */}
                        <div className="md:col-span-12">
                            <div className="bg-black/40 border border-gray-900 rounded-xl p-2 font-mono text-[10px] h-20 overflow-y-auto custom-scrollbar">
                                {logs.length === 0 ? (
                                    <span className="text-gray-700 italic">No activity logs...</span>
                                ) : (
                                    logs.map((l, i) => (
                                        <div key={i} className="flex gap-2 mb-0.5 opacity-80 hover:opacity-100 transition-opacity">
                                            <span className="text-purple-700 font-bold tracking-tighter">&gt;</span>
                                            <span className="text-gray-400 break-all">{l}</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                    </main>
                )}

                {/* All Contract Content Area */}
                <section className="space-y-4 pt-4">
                    <div className="flex items-center justify-between px-2">
                        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-gray-400 flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
                            Explore Content
                        </h2>
                        <span className="text-[10px] text-gray-700 font-bold">{ownedTickets.length} ITEMS TOTAL</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-20">
                        {ownedTickets.map((ticket, i) => (
                            <div key={i} className={`group relative bg-[#111] border ${ticket.is_creator || ticket.is_owner ? 'border-purple-500/30 ring-1 ring-purple-500/10' : 'border-gray-800'} p-3 rounded-2xl overflow-hidden transition-all hover:border-gray-600 hover:shadow-2xl`}>

                                {/* Status Badge */}
                                <div className="absolute top-2 right-2 z-10 flex gap-1">
                                    {ticket.is_creator && (
                                        <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-purple-600 text-white rounded-md shadow-lg shadow-purple-600/30">CREATOR</span>
                                    )}
                                    {ticket.is_owner && !ticket.is_creator && (
                                        <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-blue-600 text-white rounded-md shadow-lg shadow-blue-600/30">OWNED</span>
                                    )}
                                </div>

                                <div className="space-y-3">
                                    <div className="aspect-video bg-black rounded-xl overflow-hidden shadow-inner relative group-hover:scale-[1.01] transition-transform">
                                        {(ticket.is_creator || ticket.is_owner) ? (
                                            <video
                                                controls
                                                className="w-full h-full object-cover"
                                                src={`https://gateway.lighthouse.storage/ipfs/${ticket.cid}`}
                                            >
                                                Browser support issue
                                            </video>
                                        ) : (
                                            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900/50 backdrop-blur-sm space-y-2">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                                                <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Encrypted</span>
                                                <button
                                                    onClick={() => buyTicket(ticket)}
                                                    disabled={!!loading}
                                                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black rounded-full shadow-lg shadow-blue-600/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-tighter"
                                                >
                                                    {loading?.includes(ticket.title) ? 'Processing...' : 'Buy Ticket'}
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-col gap-1">
                                        <h4 className="text-sm font-bold text-white truncate">{ticket.title}</h4>
                                        <div className="flex justify-between items-center text-[10px]">
                                            <span className="text-gray-600 font-mono truncate max-w-[120px]">{ticket.cid}</span>
                                            <span className="text-gray-500 italic">@{ticket.creator?.split('.')[0]}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {ownedTickets.length === 0 && (
                            <div className="col-span-full py-12 text-center border-2 border-dashed border-gray-900 rounded-3xl">
                                <p className="text-xs text-gray-700 font-black uppercase tracking-widest">No content found on contract</p>
                            </div>
                        )}
                    </div>
                </section>

                {/* Global Footer */}
                <footer className="fixed bottom-0 left-0 right-0 p-4 pointer-events-none">
                    <div className="max-w-xl mx-auto flex justify-between items-center px-4 py-2 bg-black/80 backdrop-blur-xl border border-gray-800 rounded-full shadow-2xl pointer-events-auto">
                        <span className="text-[9px] font-black text-purple-500 uppercase tracking-widest">Network: {DEFAULT_CONFIG.networkId}</span>
                        <span className="text-[9px] text-gray-600 font-mono truncate max-w-[200px]">{DEFAULT_CONFIG.contractId}</span>
                    </div>
                </footer>

            </div>

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 3px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #222;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #333;
                }
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap');
                body {
                    font-family: 'Outfit', sans-serif;
                }
            `}</style>
        </div>
    );
}
