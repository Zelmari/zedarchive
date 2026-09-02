'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, Cloud, CloudOff, RefreshCw, CheckCircle2 } from 'lucide-react';
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

  const statusClass =
    syncState === 'offline'
      ? 'border-decorative bg-surface-subtle text-ink-muted'
      : syncState === 'syncing'
        ? 'border-accent bg-accent-soft text-accent'
        : syncState === 'error'
          ? 'border-danger bg-danger-surface text-danger'
          : pendingCount > 0
            ? 'border-warning bg-warning-surface text-warning'
            : 'border-success bg-success-surface text-success';

  const statusLabel =
    syncState === 'offline'
      ? `Offline (${pendingCount})`
      : syncState === 'syncing'
        ? `Syncing (${pendingCount})...`
        : syncState === 'error'
          ? `Sync failed (${pendingCount})`
          : pendingCount > 0
            ? `${pendingCount} queued`
            : 'In Sync';

  return (
    <button
      type="button"
      onClick={() => replayOutbox()}
      className={`inline-flex cursor-pointer items-center gap-[var(--za-space-1)] rounded-small border px-[var(--za-space-2)] py-0.5 font-[var(--za-font-mono)] text-[11px] transition-colors ${statusClass}`}
      title={
        syncState === 'offline'
          ? 'Working offline. Changes are saved locally and will sync when reconnected.'
          : syncState === 'error'
            ? 'Sync failed. Click to retry.'
            : pendingCount > 0
              ? `${pendingCount} offline change(s) pending sync. Click to retry.`
              : 'Archive is in sync.'
      }
      aria-label={statusLabel}
    >
      {syncState === 'offline' ? (
        <>
          <CloudOff size={12} strokeWidth={2} className="text-ink-muted" />
          <span>{statusLabel}</span>
        </>
      ) : syncState === 'syncing' ? (
        <>
          <RefreshCw size={12} strokeWidth={2} className="animate-spin text-accent" />
          <span>{statusLabel}</span>
        </>
      ) : syncState === 'error' ? (
        <>
          <AlertTriangle size={12} strokeWidth={2} className="text-danger" />
          <span>{statusLabel}</span>
        </>
      ) : pendingCount > 0 ? (
        <>
          <Cloud size={12} strokeWidth={2} className="text-warning" />
          <span>{statusLabel}</span>
        </>
      ) : (
        <>
          <CheckCircle2 size={12} strokeWidth={2} className="text-success" />
          <span>{statusLabel}</span>
        </>
      )}
    </button>
  );
}
