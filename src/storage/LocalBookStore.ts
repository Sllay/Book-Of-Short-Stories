import type { LogicalAnchor } from '../document/BookDocument';
import type { TypographySettings } from '../pagination/types';
import type { BookSourceType } from './SourceTypes';

const DB_NAME = 'book-of-short-stories';
const DB_VERSION = 1;

type SourceStorage = 'opfs' | 'indexeddb';

interface StoredSourceRecord {
  readonly bookId: string;
  readonly blob: Blob;
}

interface StoredSettingRecord {
  readonly key: string;
  readonly value: unknown;
}

interface OpfsWritable {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}

interface OpfsFileHandle {
  createWritable(): Promise<OpfsWritable>;
  getFile(): Promise<File>;
}

interface OpfsDirectoryHandle {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<OpfsDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<OpfsFileHandle>;
}

interface StorageManagerWithOpfs extends StorageManager {
  getDirectory?: () => Promise<OpfsDirectoryHandle>;
}

export interface StoredBookRecord {
  readonly id: string;
  readonly title: string;
  readonly sourceName: string;
  readonly sourceType: BookSourceType;
  readonly mimeType: string;
  readonly size: number;
  readonly sourceStorage: SourceStorage;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly lastOpenedAt: number;
}

export interface StoredProgressRecord {
  readonly bookId: string;
  readonly anchor: LogicalAnchor;
  readonly typography: TypographySettings;
  readonly updatedAt: number;
}

export interface StoredBookmarkRecord {
  readonly id: string;
  readonly bookId: string;
  readonly anchor: LogicalAnchor;
  readonly createdAt: number;
}

export interface RecentBookSource {
  readonly book: StoredBookRecord;
  readonly source: Blob;
}

export interface SaveBookSourceInput {
  readonly id: string;
  readonly title: string;
  readonly sourceName: string;
  readonly sourceType: BookSourceType;
  readonly mimeType: string;
}

export class LocalBookStore {
  private databasePromise: Promise<IDBDatabase> | null = null;

  public async saveBookSource(input: SaveBookSourceInput, source: Blob): Promise<StoredBookRecord> {
    const existing = await this.getBook(input.id);
    const now = Date.now();
    let sourceStorage: SourceStorage = 'indexeddb';

    try {
      const writtenToOpfs = await this.writeSourceToOpfs(input.id, source);
      if (writtenToOpfs) {
        sourceStorage = 'opfs';
        await this.deleteIndexedDbSource(input.id);
      } else {
        await this.writeIndexedDbSource(input.id, source);
      }
    } catch {
      sourceStorage = 'indexeddb';
      await this.writeIndexedDbSource(input.id, source);
    }

    const record: StoredBookRecord = {
      id: input.id,
      title: input.title,
      sourceName: input.sourceName,
      sourceType: input.sourceType,
      mimeType: input.mimeType,
      size: source.size,
      sourceStorage,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastOpenedAt: now
    };

    await this.put('books', record);
    await this.setPreference('lastBookId', record.id);
    await this.requestPersistentStorage();
    return record;
  }

  public async getRecentBookSource(): Promise<RecentBookSource | null> {
    const lastBookId = await this.getPreference<string>('lastBookId');
    if (!lastBookId) return null;

    const book = await this.getBook(lastBookId);
    if (!book) return null;

    const source = await this.readSource(book);
    if (!source) return null;

    const refreshed: StoredBookRecord = { ...book, lastOpenedAt: Date.now() };
    await this.put('books', refreshed);
    return { book: refreshed, source };
  }

  public async clearRecentBook(): Promise<void> {
    await this.setPreference('lastBookId', null);
  }

  public async saveProgress(record: Omit<StoredProgressRecord, 'updatedAt'>): Promise<void> {
    await this.put('progress', { ...record, updatedAt: Date.now() } satisfies StoredProgressRecord);
  }

  public async getProgress(bookId: string): Promise<StoredProgressRecord | null> {
    return this.get<StoredProgressRecord>('progress', bookId);
  }

  public async toggleBookmark(bookId: string, anchor: LogicalAnchor): Promise<boolean> {
    const id = this.bookmarkId(bookId, anchor);
    const existing = await this.get<StoredBookmarkRecord>('bookmarks', id);
    if (existing) {
      await this.delete('bookmarks', id);
      return false;
    }

    await this.put('bookmarks', {
      id,
      bookId,
      anchor,
      createdAt: Date.now()
    } satisfies StoredBookmarkRecord);
    return true;
  }

  public async isBookmarked(bookId: string, anchor: LogicalAnchor): Promise<boolean> {
    return (await this.get<StoredBookmarkRecord>('bookmarks', this.bookmarkId(bookId, anchor))) !== null;
  }

  public async getPreference<T>(key: string): Promise<T | null> {
    const record = await this.get<StoredSettingRecord>('settings', key);
    return record ? record.value as T : null;
  }

  public async setPreference(key: string, value: unknown): Promise<void> {
    await this.put('settings', { key, value } satisfies StoredSettingRecord);
  }

  public async estimateStorage(): Promise<{ usage: number; quota: number } | null> {
    if (!navigator.storage?.estimate) return null;
    const estimate = await navigator.storage.estimate();
    if (typeof estimate.usage !== 'number' || typeof estimate.quota !== 'number') return null;
    return { usage: estimate.usage, quota: estimate.quota };
  }

  private async getBook(bookId: string): Promise<StoredBookRecord | null> {
    return this.get<StoredBookRecord>('books', bookId);
  }

  private async readSource(book: StoredBookRecord): Promise<Blob | null> {
    if (book.sourceStorage === 'opfs') {
      try {
        const opfsFile = await this.readSourceFromOpfs(book.id);
        if (opfsFile) return opfsFile;
      } catch {
        // A browser may lose OPFS support after a migration. Fall back to IDB if a
        // previous copy happens to be available instead of failing the whole reader.
      }
    }

    const record = await this.get<StoredSourceRecord>('sources', book.id);
    return record?.blob ?? null;
  }

  private async writeIndexedDbSource(bookId: string, blob: Blob): Promise<void> {
    await this.put('sources', { bookId, blob } satisfies StoredSourceRecord);
  }

  private async deleteIndexedDbSource(bookId: string): Promise<void> {
    await this.delete('sources', bookId);
  }

  private async writeSourceToOpfs(bookId: string, blob: Blob): Promise<boolean> {
    const root = await this.getOpfsRoot();
    if (!root) return false;
    const booksDirectory = await root.getDirectoryHandle('books', { create: true });
    const fileHandle = await booksDirectory.getFileHandle(this.opfsFileName(bookId), { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  }

  private async readSourceFromOpfs(bookId: string): Promise<File | null> {
    const root = await this.getOpfsRoot();
    if (!root) return null;
    const booksDirectory = await root.getDirectoryHandle('books');
    const fileHandle = await booksDirectory.getFileHandle(this.opfsFileName(bookId));
    return fileHandle.getFile();
  }

  private async getOpfsRoot(): Promise<OpfsDirectoryHandle | null> {
    const storage = navigator.storage as StorageManagerWithOpfs | undefined;
    if (!storage?.getDirectory) return null;
    return storage.getDirectory();
  }

  private opfsFileName(bookId: string): string {
    return `${encodeURIComponent(bookId)}.source`;
  }

  private bookmarkId(bookId: string, anchor: LogicalAnchor): string {
    return `${bookId}::${anchor.chapterId}::${anchor.blockId}::${anchor.offset}`;
  }

  private async requestPersistentStorage(): Promise<void> {
    try {
      if (navigator.storage?.persist) await navigator.storage.persist();
    } catch {
      // Persistence is an optimization. IndexedDB/OPFS still work when the browser
      // refuses the persistent-storage hint.
    }
  }

  private async openDatabase(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;

    this.databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error ?? new Error('Falha ao abrir armazenamento local.'));
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('books')) database.createObjectStore('books', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('sources')) database.createObjectStore('sources', { keyPath: 'bookId' });
        if (!database.objectStoreNames.contains('progress')) database.createObjectStore('progress', { keyPath: 'bookId' });
        if (!database.objectStoreNames.contains('bookmarks')) {
          const bookmarks = database.createObjectStore('bookmarks', { keyPath: 'id' });
          bookmarks.createIndex('bookId', 'bookId', { unique: false });
        }
        if (!database.objectStoreNames.contains('settings')) database.createObjectStore('settings', { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
    });

    return this.databasePromise;
  }

  private async get<T>(storeName: string, key: IDBValidKey): Promise<T | null> {
    const database = await this.openDatabase();
    const transaction = database.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).get(key);
    const result = await this.request<T | undefined>(request);
    return result ?? null;
  }

  private async put(storeName: string, value: unknown): Promise<void> {
    const database = await this.openDatabase();
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(value);
    await this.transactionDone(transaction);
  }

  private async delete(storeName: string, key: IDBValidKey): Promise<void> {
    const database = await this.openDatabase();
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).delete(key);
    await this.transactionDone(transaction);
  }

  private request<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Falha em operação IndexedDB.'));
    });
  }

  private transactionDone(transaction: IDBTransaction): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Falha ao salvar dados localmente.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Operação local cancelada.'));
    });
  }
}
