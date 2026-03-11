// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OpenAPIDoc = Record<string, any>;

interface CacheEntry {
  doc: OpenAPIDoc;
  expiresAt: number;
}

const DEFAULT_TTL = 300_000; // 5 minutes
const MAX_ENTRIES = 20;

export class SpecCache {
  private cache = new Map<string, CacheEntry>();
  private ttl: number;

  constructor(ttl = DEFAULT_TTL) {
    this.ttl = ttl;
  }

  get(url: string): OpenAPIDoc | null {
    const entry = this.cache.get(url);
    if (!entry) return null;

    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(url);
      return null;
    }

    // LRU: re-insert to move to end
    this.cache.delete(url);
    this.cache.set(url, entry);

    return entry.doc;
  }

  set(url: string, doc: OpenAPIDoc): void {
    // Remove if exists (to update position)
    this.cache.delete(url);

    // Evict oldest if at capacity
    if (this.cache.size >= MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value as string;
      this.cache.delete(oldest);
    }

    this.cache.set(url, {
      doc,
      expiresAt: Date.now() + this.ttl,
    });
  }

  invalidate(url: string): void {
    this.cache.delete(url);
  }
}
