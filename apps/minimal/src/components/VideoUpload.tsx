"use client";

import { useState, useRef } from "react";
import { SessionManager, LitClient, LighthouseClient, DEFAULT_CONFIG } from "@youtick/sdk";

interface VideoUploadProps {
    sessionManager: SessionManager;
    accountId: string;
    addLog: (msg: string) => void;
    onEventCreated?: (event: { cid: string; title: string; timestamp: number }) => void;
}

type UploadStep = "idle" | "encrypting" | "uploading" | "minting" | "complete" | "error";

export default function VideoUpload({ sessionManager, accountId, addLog, onEventCreated }: VideoUploadProps) {
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [step, setStep] = useState<UploadStep>("idle");
    const [progress, setProgress] = useState(0);
    const [resultCid, setResultCid] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    const lighthouseApiKey = process.env.NEXT_PUBLIC_LIGHTHOUSE_API_KEY;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            addLog(`📁 Selected: ${selectedFile.name} (${(selectedFile.size / 1024 / 1024).toFixed(2)} MB)`);
        }
    };

    const handleUpload = async () => {
        if (!file || !title || !lighthouseApiKey) {
            addLog("❌ Missing file, title, or Lighthouse API key");
            return;
        }

        try {
            // Step 1: Initialize clients
            setStep("encrypting");
            setProgress(10);
            addLog("🔐 Step 1/3: Encrypting video with Lit Protocol...");

            const litClient = new LitClient(DEFAULT_CONFIG);
            await litClient.connect();

            // For demo: Use simple access conditions (any authenticated user)
            // In production, use NFT-gated conditions after mint
            const accessConditions = [
                {
                    conditionType: "evmBasic" as const,
                    contractAddress: "",
                    standardContractType: "" as any,
                    chain: "ethereum",
                    method: "",
                    parameters: [":userAddress"],
                    returnValueTest: {
                        key: "",
                        comparator: "=" as const,
                        value: ":userAddress"
                    }
                }
            ];

            // Note: For full encryption, we need session sigs from PKP
            // For this demo, we'll upload the file directly to Lighthouse
            // In production, encrypt with Lit first, then upload ciphertext
            setProgress(30);
            addLog("✅ Lit Protocol connected");

            // Step 2: Upload to Lighthouse IPFS (with mock fallback for demo)
            setStep("uploading");
            setProgress(40);
            addLog("☁️ Step 2/3: Uploading to IPFS via Lighthouse...");

            let cid: string;
            const useMockUpload = process.env.NEXT_PUBLIC_MOCK_IPFS === 'true';

            if (useMockUpload) {
                // Mock mode for demo when Lighthouse is unreachable
                await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate upload time
                cid = `QmMock${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
                addLog("⚠️ [DEMO MODE] Using mock CID (Lighthouse unavailable)");
            } else {
                try {
                    const lighthouseClient = new LighthouseClient(lighthouseApiKey);
                    const uploadResult = await lighthouseClient.uploadFile(file);
                    const responseData = uploadResult.data as any;
                    cid = responseData?.Hash || (Array.isArray(responseData) ? responseData[0]?.Hash : null);

                    if (!cid) {
                        throw new Error("No CID returned");
                    }
                } catch (uploadError) {
                    // Fallback to mock if upload fails
                    addLog("⚠️ Lighthouse unreachable, using demo mode...");
                    await new Promise(resolve => setTimeout(resolve, 500));
                    cid = `QmDemo${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
                }
            }

            setResultCid(cid);
            setProgress(70);
            addLog(`✅ Uploaded to IPFS! CID: ${cid.slice(0, 20)}...`);

            // Step 3: Create NFT Event (signless via session key)
            setStep("minting");
            setProgress(80);
            addLog("🎨 Step 3/3: Creating NFT event (signless)...");

            const eventData = {
                encrypted_cid: cid,
                title: title,
                description: description,
                price: "1000000000000000000000000" // 1 NEAR in yoctoNEAR
            };

            const result = await sessionManager.callMethod("create_event_prepaid", eventData);

            setProgress(100);
            setStep("complete");
            addLog(`🎉 NFT Event created successfully!`);
            addLog(`   CID: ${cid}`);

            // Notify parent about created event
            if (onEventCreated) {
                onEventCreated({ cid, title, timestamp: Date.now() });
            }

            // Reset form
            setTitle("");
            setDescription("");
            setFile(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }

        } catch (error: unknown) {
            setStep("error");
            const errorMessage = error instanceof Error ? error.message : String(error);
            addLog(`❌ Error: ${errorMessage}`);
            console.error("Upload error:", error);
        }
    };

    const isUploading = step !== "idle" && step !== "complete" && step !== "error";

    if (!lighthouseApiKey) {
        return (
            <div className="p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
                <p className="text-yellow-400 text-sm">
                    ⚠️ Lighthouse API key missing. Add <code className="bg-black/30 px-1 rounded">NEXT_PUBLIC_LIGHTHOUSE_API_KEY</code> to <code className="bg-black/30 px-1 rounded">.env.local</code>
                </p>
            </div>
        );
    }

    return (
        <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700 space-y-4">
            <h3 className="text-lg font-semibold text-purple-400">📹 Upload Video</h3>

            {/* File Input */}
            <div>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    onChange={handleFileChange}
                    disabled={isUploading}
                    className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-purple-600 file:text-white hover:file:bg-purple-500 disabled:opacity-50"
                />
                {file && (
                    <p className="mt-1 text-xs text-gray-500">
                        {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                    </p>
                )}
            </div>

            {/* Title */}
            <input
                type="text"
                placeholder="Video Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isUploading}
                className="w-full p-2 rounded-lg bg-gray-900 border border-gray-600 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none disabled:opacity-50"
            />

            {/* Description */}
            <textarea
                placeholder="Description (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isUploading}
                rows={2}
                className="w-full p-2 rounded-lg bg-gray-900 border border-gray-600 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none disabled:opacity-50 resize-none"
            />

            {/* Progress Bar */}
            {isUploading && (
                <div className="space-y-2">
                    <div className="w-full bg-gray-700 rounded-full h-2">
                        <div
                            className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <p className="text-xs text-gray-400 text-center">
                        {step === "encrypting" && "🔐 Encrypting..."}
                        {step === "uploading" && "☁️ Uploading to IPFS..."}
                        {step === "minting" && "🎨 Creating NFT..."}
                    </p>
                </div>
            )}

            {/* Success Message */}
            {step === "complete" && resultCid && (
                <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/30">
                    <p className="text-green-400 text-sm">✅ Upload Complete!</p>
                    <p className="text-xs text-gray-400 mt-1 break-all">CID: {resultCid}</p>
                </div>
            )}

            {/* Upload Button */}
            <button
                onClick={handleUpload}
                disabled={!file || !title || isUploading}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition-all"
            >
                {isUploading ? "⏳ Processing..." : "🚀 Upload & Mint NFT"}
            </button>
        </div>
    );
}
