'use client';

import { useState, useEffect } from 'react';
import { Cloud, CloudOff, RefreshCw, CheckCircle2 } from 'lucide-react';
import {
  initSyncEngine,
  replayOutbox,
  type SyncState,
  type SyncStatusEventDetail,
} from '@/lib/offline/syncEngine';
import { getPendingMutations } from '@/lib/offline/outbox';

export default function SyncIndicator() {
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const cleanup = initSyncEngine();

    const handleSyncStatus = (event: Event) => {
      const customEvent = event as CustomEvent<SyncStatusEventDetail>;
      if (customEvent.detail) {
        setSyncState(customEvent.detail.state);
        setPendingCount(customEvent.detail.pendingCount);
      }
    };

    window.addEventListener('za:sync-status', handleSyncStatus);

    // Initial query
    getPendingMutations().then((items) => {
      setPendingCount(items.length);
      if (!navigator.onLine) {
        setSyncState('offline');
      }
    });

    return () => {
      cleanup();
      window.removeEventListener('za:sync-status', handleSyncStatus);
    };
  }, []);

  if (syncState === 'idle' && pendingCount === 0) {
    return null; // Keep header quiet when fully synced
  }

  return (
    <button
      type="button"
      onClick={() => replayOutbox()}
      className={`inline-flex cursor-pointer items-center gap-[var(--za-space-1)] rounded-control border border-decorative px-[var(--za-space-2)] py-0.5 text-[11px] transition-colors ${
        syncState === 'offline'
          ? 'bg-surface-subtle text-ink-muted'
          : syncState === 'syncing'
            ? 'border-accent bg-surface text-accent'
            : pendingCount > 0
              ? 'border-accent/40 bg-surface-subtle text-ink'
              : 'border-decorative bg-surface text-ink-muted'
      }`}
      title={
        syncState === 'offline'
          ? 'Working offline. Changes are saved locally and will sync when reconnected.'
          : `${pendingCount} offline change(s) pending sync. Click to retry.`
      }
    >
      {syncState === 'offline' ? (
        <>
          <CloudOff size={12} strokeWidth={2} className="text-ink-muted" />
          <span>Offline ({pendingCount})</span>
        </>
      ) : syncState === 'syncing' ? (
        <>
          <RefreshCw size={12} strokeWidth={2} className="animate-spin text-accent" />
          <span>Syncing ({pendingCount})...</span>
        </>
      ) : pendingCount > 0 ? (
        <>
          <Cloud size={12} strokeWidth={2} className="text-accent" />
          <span>{pendingCount} unsynced</span>
        </>
      ) : (
        <>
          <CheckCircle2 size={12} strokeWidth={2} className="text-green-600" />
          <span>In Sync</span>
        </>
      )}
    </button>
  );
}
