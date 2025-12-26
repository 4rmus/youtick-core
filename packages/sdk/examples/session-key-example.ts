/**
 * Session Key Example
 * 
 * This example demonstrates how to use NEAR session keys for signless transactions.
 * Session keys allow users to interact with your dApp without constantly approving
 * transactions in their wallet.
 */

import { SessionManager, DEFAULT_CONFIG, WalletInterface } from '@youtick/sdk';

async function main() {
    // 1. Initialize Session Manager
    // The SessionManager handles all session key operations
    const accountId = 'your-account.testnet';
    const sessionManager = new SessionManager(accountId, DEFAULT_CONFIG);

    console.log('📦 Session Manager initialized');
    console.log(`   Contract: ${DEFAULT_CONFIG.contractId}`);
    console.log(`   Network: ${DEFAULT_CONFIG.networkId}`);

    // 2. Check if session key already exists
    const hasSession = await sessionManager.hasSessionKey();
    console.log(`\n🔑 Session Key Status: ${hasSession ? 'Active ✅' : 'Missing ❌'}`);

    if (!hasSession) {
        console.log('\n⚠️  No session key found. Creating one...');

        // This requires wallet interaction (the ONLY signature needed!)
        // Wallet must implement WalletInterface from @youtick/sdk
        const wallet: WalletInterface = null as any; // TODO: your wallet instance

        // Create session key with 1 NEAR prepaid gas deposit
        await sessionManager.createSessionKey(wallet, '1');
        console.log('✅ Session key created successfully!');
    }

    // 3. Execute signless transactions
    // From now on, no wallet popups needed!
    console.log('\n🚀 Executing signless transaction...');

    try {
        const result = await sessionManager.callMethod('get_user_balance', {
            account_id: accountId
        });
        console.log('Balance:', result);
    } catch (error: unknown) {
        console.error('Error:', error instanceof Error ? error.message : error);
    }

    // 4. Check prepaid gas balance
    const balance = await sessionManager.getAccountBalance();
    console.log(`\n💰 Prepaid Gas Balance: ${balance} NEAR`);
}

main().catch(console.error);
