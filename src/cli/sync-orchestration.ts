/**
 * Shared orchestration helper for sync and indexing operations.
 * Ensures syncDone signal is always resolved (even on failure) so indexing
 * can properly drain and exit.
 */

import { runSync, type SyncOptions, type SyncResult } from "~/sync";
import { indexMessages, type IndexingResult } from "~/search/indexing";

export interface SyncAndIndexResult {
  syncResult: SyncResult | null;
  indexResult: IndexingResult;
}

/**
 * Run sync and indexing concurrently, ensuring syncDone signal is always resolved.
 * This helper centralizes the orchestration logic used by both `sync --foreground`
 * and `refresh` commands.
 *
 * @param syncOptions Options for sync operation
 * @returns Results from both sync and indexing operations
 */
export async function runSyncAndIndex(
  syncOptions: SyncOptions
): Promise<SyncAndIndexResult> {
  // Create syncDone promise that will be resolved in finally block
  // This ensures indexing always gets the completion signal, even if sync fails
  let resolveSyncDone!: () => void;
  const syncDone = new Promise<void>((resolve) => {
    resolveSyncDone = resolve;
  });

  let syncResult: SyncResult | null = null;
  let syncError: Error | null = null;

  // Run sync with guaranteed completion signaling
  const syncPromise = (async () => {
    try {
      const result = await runSync(syncOptions);
      syncResult = result;
      return result;
    } catch (error) {
      syncError = error instanceof Error ? error : new Error(String(error));
      throw error;
    } finally {
      // Always resolve syncDone, regardless of success or failure
      // This ensures indexing can properly drain and exit
      resolveSyncDone();
    }
  })();

  // Run indexing concurrently, waiting for syncDone signal
  const indexPromise = indexMessages({ syncDone });

  // Wait for both to complete
  const [finalSyncResult, indexResult] = await Promise.all([
    syncPromise.catch(() => null), // Don't throw, we'll handle syncError separately
    indexPromise,
  ]);

  // If sync threw an error, re-throw it after indexing has completed
  if (syncError) {
    throw syncError;
  }

  return {
    syncResult: finalSyncResult ?? syncResult,
    indexResult,
  };
}
