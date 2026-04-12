import { useCallback, useRef } from 'react';

export function usePrefetchedBatch<T>(fetchBatch: () => Promise<T[] | null>) {
  const prefetchedBatchRef = useRef<T[] | null>(null);
  const prefetchPromiseRef = useRef<Promise<T[] | null> | null>(null);
  const prefetchedErrorRef = useRef<unknown>(null);

  const prefetchNext = useCallback(async (): Promise<T[] | null> => {
    if (prefetchedBatchRef.current) {
      return prefetchedBatchRef.current;
    }

    if (prefetchPromiseRef.current) {
      return prefetchPromiseRef.current;
    }

    prefetchedErrorRef.current = null;

    const promise = fetchBatch()
      .then((batch) => {
        prefetchedBatchRef.current = batch;
        return batch;
      })
      .catch((error) => {
        prefetchedErrorRef.current = error;
        throw error;
      })
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

    if (prefetchedErrorRef.current) {
      const error = prefetchedErrorRef.current;
      prefetchedErrorRef.current = null;
      throw error;
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
