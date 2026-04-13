type BufferedBatchQueueOptions<T> = {
  fetchBatch: (excludeIds: string[]) => Promise<T[] | null>;
  collectIds: (items: T[]) => string[];
  bufferSize?: number;
  onStateChange?: () => void;
};

export class BufferedBatchQueue<T> {
  private readonly fetchBatch: (excludeIds: string[]) => Promise<T[] | null>;
  private readonly collectIds: (items: T[]) => string[];
  private readonly bufferSize: number;
  private readonly onStateChange?: () => void;
  private readyBatches: T[][] = [];
  private pendingBatchPromise: Promise<T[] | null> | null = null;
  private lastCommittedItems: T[] = [];
  private pendingError: unknown = null;
  private exhausted = false;
  private disposed = false;

  constructor(options: BufferedBatchQueueOptions<T>) {
    this.fetchBatch = options.fetchBatch;
    this.collectIds = options.collectIds;
    this.bufferSize = Math.max(1, options.bufferSize ?? 1);
    this.onStateChange = options.onStateChange;
  }

  ensureBuffered(committedItems: T[]) {
    if (this.disposed) {
      return;
    }

    this.lastCommittedItems = [...committedItems];
    this.scheduleNextFetch();
  }

  async consumeNext(): Promise<T[] | null> {
    if (this.disposed) {
      return null;
    }

    if (this.readyBatches.length > 0) {
      const nextBatch = this.readyBatches.shift() ?? null;
      this.notifyStateChange();
      return nextBatch;
    }

    if (this.pendingError) {
      const error = this.pendingError;
      this.pendingError = null;
      this.notifyStateChange();
      throw error;
    }

    if (this.pendingBatchPromise) {
      await this.pendingBatchPromise.catch(() => null);
      if (this.readyBatches.length > 0) {
        const nextBatch = this.readyBatches.shift() ?? null;
        this.notifyStateChange();
        return nextBatch;
      }

      if (this.pendingError) {
        const error = this.pendingError;
        this.pendingError = null;
        this.notifyStateChange();
        throw error;
      }
    }

    this.notifyStateChange();
    return null;
  }

  hasBufferedBatches() {
    return this.readyBatches.length > 0;
  }

  isExhausted() {
    return this.exhausted;
  }

  getBufferedCount() {
    return this.readyBatches.length;
  }

  async waitForIdle() {
    while (this.pendingBatchPromise) {
      await this.pendingBatchPromise.catch(() => null);
    }
  }

  reset() {
    this.readyBatches = [];
    this.pendingBatchPromise = null;
    this.lastCommittedItems = [];
    this.pendingError = null;
    this.exhausted = false;
    this.notifyStateChange();
  }

  dispose() {
    this.disposed = true;
    this.readyBatches = [];
    this.pendingBatchPromise = null;
    this.lastCommittedItems = [];
    this.pendingError = null;
  }

  private scheduleNextFetch() {
    if (this.disposed) {
      return;
    }

    if (this.exhausted || this.pendingBatchPromise || this.readyBatches.length >= this.bufferSize) {
      return;
    }

    const excludeIds = this.collectIds([
      ...this.lastCommittedItems,
      ...this.readyBatches.flat()
    ]);
    const batchPromise = this.fetchBatch(excludeIds);
    this.pendingBatchPromise = batchPromise;
    this.notifyStateChange();

    void (async () => {
      try {
        const batch = await batchPromise;

        if (this.disposed) {
          return;
        }

        if (this.pendingBatchPromise === batchPromise) {
          this.pendingBatchPromise = null;
        }

        if (batch && batch.length > 0) {
          this.readyBatches.push(batch);
        } else {
          this.exhausted = true;
        }

        this.notifyStateChange();
        if (!this.pendingError) {
          this.scheduleNextFetch();
        }
      } catch (error) {
        if (this.disposed) {
          return;
        }

        if (this.pendingBatchPromise === batchPromise) {
          this.pendingBatchPromise = null;
        }

        this.pendingError = error;
        this.notifyStateChange();
      }
    })();
  }

  private notifyStateChange() {
    if (!this.disposed) {
      this.onStateChange?.();
    }
  }
}
