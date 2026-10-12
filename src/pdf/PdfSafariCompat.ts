// Safari/iOS can expose ReadableStream without Symbol.asyncIterator.
// PDF.js getTextContent() uses `for await...of` internally, which then throws
// `TypeError: undefined is not a function` on affected Safari versions.
// Keep this tiny local compatibility shim instead of depending on a network polyfill.

export function installReadableStreamAsyncIteratorCompat(): void {
  if (typeof ReadableStream === 'undefined' || typeof Symbol.asyncIterator === 'undefined') return;

  const prototype = ReadableStream.prototype as unknown as Record<PropertyKey, unknown>;
  const key = Symbol.asyncIterator;
  if (typeof prototype[key] === 'function') return;

  Object.defineProperty(prototype, key, {
    configurable: true,
    writable: true,
    value: async function* (this: ReadableStream<unknown>): AsyncGenerator<unknown, void, unknown> {
      const reader = this.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) return;
          yield value;
        }
      } finally {
        reader.releaseLock();
      }
    }
  });
}

installReadableStreamAsyncIteratorCompat();
