import { useCallback, useRef } from 'react';

export function usePrefetchedBatch<T>(fetchBatch: () => Promise<T[] | null>) {
  const prefetchedBatchRef = useRef<T[] | null>(null);
  const prefetchPromiseRef = useRef<Promise<T[] | null> | null>(null);

  const prefetchNext = useCallback(async (): Promise<T[] | null> => {
    if (prefetchedBatchRef.current) {
      return prefetchedBatchRef.current;
    }

    if (prefetchPromiseRef.current) {
      return prefetchPromiseRef.current;
    }

    const promise = fetchBatch()
      .then((batch) => {
        prefetchedBatchRef.current = batch;
        return batch;
      })
      .catch(() => null)
      .finally(() => {
        prefetchPromiseRef.current = null;
      });

    prefetchPromiseRef.current = promise;
    return promise;
  }, [fetchBatch]);

  const consumePrefetched = useCallback(async (): Promise<T[] | null> => {
    if (prefetchedBatchRef.current) {
      const batch = prefetchedBatchRef.current;
      prefetchedBatchRef.current = null;
      return batch;
    }

    if (prefetchPromiseRef.current) {
      const batch = await prefetchPromiseRef.current;
      prefetchedBatchRef.current = null;
      return batch;
    }

    return null;
  }, []);

  return {
    prefetchNext,
    consumePrefetched,
  };
}
