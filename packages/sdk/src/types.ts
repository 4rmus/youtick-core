export interface StorageInterface {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export class MemoryStorage implements StorageInterface {
    private storage = new Map<string, string>();

    getItem(key: string): string | null {
        return this.storage.get(key) || null;
    }

    setItem(key: string, value: string): void {
        this.storage.set(key, value);
    }

    removeItem(key: string): void {
        this.storage.delete(key);
    }
}
