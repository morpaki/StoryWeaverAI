
import { Book, BrainstormConfig, PromptKind, ProviderConfigs, SuggestionConfig, SuggestionMode, SummaryConfig } from '../types';

const DB_NAME = 'StoryWeaverDB';
const DB_VERSION = 3; 
const STORE_BOOKS = 'books';
const STORE_SETTINGS = 'settings';
const STORE_PROMPT_KINDS = 'prompt_kinds';
const STORE_SUGGESTION_MODES = 'suggestion_modes';

export const db = {
  async open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_BOOKS)) {
          db.createObjectStore(STORE_BOOKS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS);
        }
        if (!db.objectStoreNames.contains(STORE_PROMPT_KINDS)) {
          db.createObjectStore(STORE_PROMPT_KINDS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_SUGGESTION_MODES)) {
          db.createObjectStore(STORE_SUGGESTION_MODES, { keyPath: 'id' });
        }
      };
    });
  },

  async getAllBooks(): Promise<Book[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_BOOKS, 'readonly');
      const store = transaction.objectStore(STORE_BOOKS);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async saveBook(book: Book): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_BOOKS, 'readwrite');
      const store = transaction.objectStore(STORE_BOOKS);
      const request = store.put(book);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async deleteBook(id: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_BOOKS, 'readwrite');
      const store = transaction.objectStore(STORE_BOOKS);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async getSettings(): Promise<{ brainstorm?: BrainstormConfig, summary?: SummaryConfig, suggestion?: SuggestionConfig, providers?: ProviderConfigs } | undefined> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_SETTINGS, 'readonly');
      const store = transaction.objectStore(STORE_SETTINGS);
      
      const requestBrainstorm = store.get('brainstormConfig');
      const requestSummary = store.get('summaryConfig');
      const requestSuggestion = store.get('suggestionConfig');
      const requestProviders = store.get('providerConfigs');
      
      let result: any = {};
      
      // Chain requests loosely
      requestBrainstorm.onsuccess = () => {
          result.brainstorm = requestBrainstorm.result;
          requestSummary.onsuccess = () => {
            result.summary = requestSummary.result;
            requestSuggestion.onsuccess = () => {
                result.suggestion = requestSuggestion.result;
                requestProviders.onsuccess = () => {
                    result.providers = requestProviders.result;
                    resolve(result);
                }
            }
          }
      }
      requestBrainstorm.onerror = () => reject(requestBrainstorm.error);
    });
  },

  async saveSettings(brainstormConfig: BrainstormConfig, summaryConfig: SummaryConfig, suggestionConfig: SuggestionConfig, providerConfigs: ProviderConfigs): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_SETTINGS, 'readwrite');
      const store = transaction.objectStore(STORE_SETTINGS);
      store.put(brainstormConfig, 'brainstormConfig');
      store.put(summaryConfig, 'summaryConfig');
      store.put(suggestionConfig, 'suggestionConfig');
      store.put(providerConfigs, 'providerConfigs');
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },

  async getAllPromptKinds(): Promise<PromptKind[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(STORE_PROMPT_KINDS)) {
            resolve([]);
            return;
        }
        const transaction = db.transaction(STORE_PROMPT_KINDS, 'readonly');
        const store = transaction.objectStore(STORE_PROMPT_KINDS);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
  },

  async savePromptKind(kind: PromptKind): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_PROMPT_KINDS, 'readwrite');
        const store = transaction.objectStore(STORE_PROMPT_KINDS);
        const request = store.put(kind);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
  },

  async deletePromptKind(id: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_PROMPT_KINDS, 'readwrite');
        const store = transaction.objectStore(STORE_PROMPT_KINDS);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
  },

  async getAllSuggestionModes(): Promise<SuggestionMode[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(STORE_SUGGESTION_MODES)) {
            resolve([]);
            return;
        }
        const transaction = db.transaction(STORE_SUGGESTION_MODES, 'readonly');
        const store = transaction.objectStore(STORE_SUGGESTION_MODES);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
  },

  async saveSuggestionMode(mode: SuggestionMode): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_SUGGESTION_MODES, 'readwrite');
        const store = transaction.objectStore(STORE_SUGGESTION_MODES);
        const request = store.put(mode);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
  },

  async deleteSuggestionMode(id: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_SUGGESTION_MODES, 'readwrite');
        const store = transaction.objectStore(STORE_SUGGESTION_MODES);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
  }
};
