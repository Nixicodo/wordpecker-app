import { useCallback, useEffect, useRef, useState } from 'react';
import { ReviewSubmission } from '../types';

type SyncMode = 'auto' | 'final';

interface UseBatchedReviewSyncOptions {
  results: ReviewSubmission[];
  syncResults: (results: ReviewSubmission[]) => Promise<unknown>;
  batchSize?: number;
  onSyncSuccess?: (syncedCount: number, mode: SyncMode) => void;
  onSyncError?: (error: unknown, pendingCount: number, mode: SyncMode) => void;
}

export const useBatchedReviewSync = ({
  results,
  syncResults,
  batchSize = 5,
  onSyncSuccess,
  onSyncError
}: UseBatchedReviewSyncOptions) => {
  const [syncedCount, setSyncedCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const resultsRef = useRef(results);
  const syncedCountRef = useRef(0);
  const syncPromiseRef = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  useEffect(() => {
    syncedCountRef.current = syncedCount;
  }, [syncedCount]);

  const syncChunk = useCallback(async (mode: SyncMode, minimumPendingCount: number) => {
    if (syncPromiseRef.current) {
      return syncPromiseRef.current;
    }

    const startSyncedCount = syncedCountRef.current;
    const pendingResults = resultsRef.current.slice(startSyncedCount);

    if (pendingResults.length < minimumPendingCount) {
      return false;
    }

    const syncTask = (async () => {
      setIsSyncing(true);
      try {
        await syncResults(pendingResults);
        const nextSyncedCount = startSyncedCount + pendingResults.length;
        syncedCountRef.current = nextSyncedCount;
        setSyncedCount((prev) => Math.max(prev, nextSyncedCount));
        onSyncSuccess?.(pendingResults.length, mode);
        return true;
      } catch (error) {
        onSyncError?.(error, pendingResults.length, mode);
        return false;
      } finally {
        setIsSyncing(false);
        syncPromiseRef.current = null;
      }
    })();

    syncPromiseRef.current = syncTask;
    return syncTask;
  }, [onSyncError, onSyncSuccess, syncResults]);

  const syncPendingResults = useCallback(async (mode: SyncMode = 'auto') => {
    let hasSynced = false;

    if (mode === 'auto') {
      if (syncPromiseRef.current) {
        return syncPromiseRef.current;
      }

      return syncChunk('auto', batchSize);
    }

    while (true) {
      if (syncPromiseRef.current) {
        hasSynced = (await syncPromiseRef.current) || hasSynced;
      }

      const pendingCount = resultsRef.current.length - syncedCountRef.current;
      if (pendingCount <= 0) {
        return hasSynced;
      }

      const synced = await syncChunk('final', 1);
      hasSynced = synced || hasSynced;

      if (!synced) {
        return hasSynced;
      }
    }
  }, [batchSize, syncChunk]);

  useEffect(() => {
    if (results.length - syncedCount < batchSize) {
      return;
    }

    void syncPendingResults('auto');
  }, [batchSize, results.length, syncedCount, syncPendingResults]);

  return {
    isSyncing,
    pendingCount: Math.max(0, results.length - syncedCount),
    syncPendingResults,
    syncedCount
  };
};
