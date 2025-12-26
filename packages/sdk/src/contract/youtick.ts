import { Account, Contract } from 'near-api-js';
import { YouTickConfig, DEFAULT_CONFIG } from '../config';

export interface VideoMetadata {
    encrypted_cid: string;
    livepeer_playback_id: string; // Optional/Empty for now
    duration_seconds: number;
    content_type: 'Concert' | 'Cinema' | 'Exclusive' | 'LiveEvent';
    event_date?: number;
}

export interface EventMetadata {
    encrypted_cid: string;
    title: string;
    description: string;
    price: string; // YoctoNEAR
    livepeer_playback_id?: string;
}

export class YouTickContract {
    private contractId: string;
    private account: Account;

    constructor(account: Account, contractId: string = DEFAULT_CONFIG.contractId) {
        this.account = account;
        this.contractId = contractId;
    }

    async createEvent(event: EventMetadata, storageDeposit: string = '0.1') {
        return await this.account.functionCall({
            contractId: this.contractId,
            methodName: 'create_event',
            args: event,
            attachedDeposit: BigInt(storageDeposit) // 0.1 NEAR default
        });
    }

    async createEventPrepaid(event: EventMetadata) {
        return await this.account.functionCall({
            contractId: this.contractId,
            methodName: 'create_event_prepaid',
            args: event,
            attachedDeposit: BigInt(0)
        });
    }

    async buyTicket(encryptedCid: string, priceCushion: string = '0.01', attachedDeposit: string) {
        return await this.account.functionCall({
            contractId: this.contractId,
            methodName: 'buy_ticket',
            args: {
                receiver_id: this.account.accountId,
                encrypted_cid: encryptedCid
            },
            attachedDeposit: BigInt(attachedDeposit)
        });
    }

    async buyTicketPrepaid(encryptedCid: string) {
        return await this.account.functionCall({
            contractId: this.contractId,
            methodName: 'buy_ticket_prepaid',
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
    async signWithMPC(payload: number[], path: string, keyVersion: number = 0) {
        return await this.account.functionCall({
            contractId: this.contractId,
            methodName: 'sign_with_mpc',
            args: { payload, path, key_version: keyVersion },
            attachedDeposit: BigInt(0), // Uses prepaid balance
            gas: BigInt('300000000000000') // 300 TGas
        });
    }

    // View functions
    async getEvents(fromIndex: number = 0, limit: number = 50): Promise<any[]> {
        return await this.account.viewFunction({
            contractId: this.contractId,
            methodName: 'get_events',
            args: { from_index: fromIndex.toString(), limit }
        });
    }

    async getTokenWithVideo(accountId: string): Promise<any[]> {
        return await this.account.viewFunction({
            contractId: this.contractId,
            methodName: 'get_tokens_with_video',
            args: { account_id: accountId }
        });
    }
}
