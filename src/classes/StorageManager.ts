import Runtime from "../util/Runtime";

/**
 * Manages storage operations with subscription support.
 * Allows storing, retrieving, clearing, and subscribing to changes in storage keys.
 * Subscribed keys will trigger callbacks when updated via the message bus.
 */
export class StorageManager {

    private static subscribedKeys: Map<string, (message: any) => void> = new Map();

    /**
     * Subscribes to a storage key. Immediately invokes the callback with the current value,
     * and subsequently whenever the key is updated via the message bus.
     * 
     * @template T - The type of the value stored under the key.
     * @param key - The storage key to subscribe to.
     * @param defaultValue - The value to initialize if the key does not exist in storage.
     * @param callback - Function invoked with the current value of the key whenever it changes.
     * @throws Error if the key is already subscribed.
     */
    static async subscribe<T>(key: string, defaultValue: T, callback: (value: T) => void) {
        if (StorageManager.subscribedKeys.has(key)) throw new Error('Cannot subscribe key more than once.');

        let value = await StorageManager.get(key) as T;
        if (value === undefined) {
            value = defaultValue;
            StorageManager.set(key, value);
        }
        callback(value);

        const listener = (message: any) => {
            if (message.action != `set-${key}`) return;
            callback(message.value);
            StorageManager.set(key, message.value);
        }
        Runtime.runtime.onMessage.addListener(listener);
        StorageManager.subscribedKeys.set(key, listener);
    }

    /**
     * Unsubscribes from updates on a storage key.
     * Removes the callback from the message bus and stops tracking the key.
     * 
     * @param key - The storage key to unsubscribe from.
     */
    static unsubscribe(key: string) {
        const listener = StorageManager.subscribedKeys.get(key);
        if (!listener) return;
        Runtime.runtime.onMessage.removeListener(listener);
        StorageManager.subscribedKeys.delete(key);
    }

    /**
     * Clears all keys from storage and unsubscribes from all currently subscribed keys.
     */
    static async clear() {
        for (const key of StorageManager.subscribedKeys.keys()) this.unsubscribe(key);
        await Runtime.storage.local.clear();
    }

    /**
     * Fetches all key-value pairs currently stored.
     * 
     * @returns A promise that resolves with an object containing all stored key-value pairs.
     */
    static async fetchAll() {
        return await Runtime.storage.local.get(null);
    }

    /**
     * Sets a value for a specific key in storage.
     * 
     * @template T - The type of the value being stored.
     * @param key - The storage key.
     * @param value - The value to store.
     * @returns A promise that resolves when the value is stored.
     */
    static set<T>(key: string, value: T): Promise<void> {
        return Runtime.storage.local.set({ [key]: value });
    }

    /**
     * Retrieves a value from storage by key.
     * 
     * @template T - The expected type of the stored value.
     * @param key - The storage key.
     * @returns A promise that resolves with the value stored under the key, or undefined if not found.
     */
    static async get<T>(key: string): Promise<T | undefined> {
        const result = await Runtime.storage.local.get(key);
        return result[key] as T | undefined;
    }

}
