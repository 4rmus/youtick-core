import lighthouse from '@lighthouse-web3/sdk';

export class LighthouseClient {
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    /**
     * Upload file to Lighthouse
     * Uses direct API call for browser compatibility
     */
    async uploadFile(file: File | FileList | any) {
        // For browser File objects, use direct API fetch to a working node
        if (typeof window !== 'undefined' && file instanceof File) {
            const formData = new FormData();
            formData.append('file', file);

            // Use 'upload.lighthouse.storage' which is alive and stable
            const response = await fetch('https://upload.lighthouse.storage/api/v0/add', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Lighthouse upload failed (${response.status}): ${errorText || response.statusText}`);
            }

            const data = await response.json();
            return { data };
        }

        // Fallback for non-browser or other types
        const uploadResponse = await lighthouse.upload(
            file,
            this.apiKey
        );

        return uploadResponse;
    }

    /**
     * Upload encrypted file to Lighthouse
     */
    async uploadEncryptedFile(
        file: File | any,
        publicKey: string,
        signedMessage: string,
        uploadProgressCallback?: (data: any) => void
    ) {
        const response = await lighthouse.uploadEncrypted(
            file,
            this.apiKey,
            publicKey,
            signedMessage,
            uploadProgressCallback
        );

        return response;
    }

    /**
     * Apply access conditions to encrypted file
     */
    async applyAccessConditions(
        cid: string,
        conditions: any[],
        publicKey: string,
        signedMessage: string,
        aggregator: string = '([1])',
        chainType: string = 'EVM'
    ) {
        const response = await lighthouse.applyAccessCondition(
            publicKey,
            cid,
            signedMessage,
            conditions,
            aggregator,
            chainType as any
        );

        return response;
    }

    async getAuthMessage(publicKey: string) {
        return await lighthouse.getAuthMessage(publicKey);
    }
}
