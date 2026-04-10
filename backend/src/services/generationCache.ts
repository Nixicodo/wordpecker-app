type CacheEntry<T> = {
  expiresAt: number;
  value?: T;
  promise?: Promise<T>;
};

class GenerationCache {
  private cache = new Map<string, CacheEntry<unknown>>();

  async getOrCreate<T>(key: string, factory: () => Promise<T>, ttlMs: number): Promise<T> {
    const now = Date.now();
    const existing = this.cache.get(key) as CacheEntry<T> | undefined;

    if (existing && existing.expiresAt > now) {
      if (existing.value !== undefined) {
        return existing.value;
      }

      if (existing.promise) {
        return existing.promise;
      }
    }

    const promise = factory()
      .then((value) => {
        this.cache.set(key, {
          expiresAt: Date.now() + ttlMs,
          value,
        });
        return value;
      })
      .catch((error) => {
        this.cache.delete(key);
        throw error;
      });

    this.cache.set(key, {
      expiresAt: now + ttlMs,
      promise,
    });

    return promise;
  }
}

export const generationCache = new GenerationCache();
