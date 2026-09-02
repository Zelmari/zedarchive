'use client';

import { useState, useRef } from 'react';
import {
  Download,
  Upload,
  FileJson,
  FileSpreadsheet,
  Check,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { bulkImportMediaEntries } from '@/server/media';
import { parseImportBuffer } from '@/lib/backup';
import type { MediaEntry } from '@/types/media';

interface DataBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries?: MediaEntry[];
  onImportSuccess?: () => void;
}

type ImportState = 'idle' | 'loading' | 'success' | 'error';

const tabButton = (active: boolean) =>
  `flex-1 cursor-pointer border-b-2 px-[var(--za-space-3)] py-[var(--za-space-3)] font-[var(--za-font-display)] text-[0.7rem] font-bold uppercase tracking-[0.08em] transition-colors ${
    active
      ? 'border-b-accent bg-surface text-ink'
      : 'border-b-transparent bg-surface-subtle text-ink-muted hover:text-ink'
  }`;

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function DataBackupModal({
  isOpen,
  onClose,
  entries = [],
  onImportSuccess,
}: DataBackupModalProps) {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [conflictStrategy, setConflictStrategy] = useState<'skip' | 'overwrite'>('skip');
  const [importStatus, setImportStatus] = useState<{
    state: ImportState;
    message: string;
  }>({ state: 'idle', message: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // EXPORT JSON
  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    downloadBlob(blob, `zedarchive-backup-${new Date().toISOString().split('T')[0]}.json`);
  };

  // EXPORT CSV
  const handleExportCSV = () => {
    const headers = [
      'Title',
      'Category',
      'Status',
      'Drop Reason',
      'Dropped At',
      'Rating',
      'Current Primary Unit',
      'Total Primary Units',
      'Current Secondary Unit',
      'Total Secondary Units',
      'Notes',
      'Created At',
      'Completed At',
    ];

    const rows = entries.map((e) => [
      `"${String(e.title || '').replace(/"/g, '""')}"`,
      e.category || 'show',
      e.status || 'in_progress',
      `"${String(e.dropReason || '').replace(/"/g, '""')}"`,
      e.droppedAt || '',
      e.rating || '',
      e.primaryUnitCurrent || 1,
      e.primaryUnitTotal || '',
      e.secondaryUnitCurrent || 0,
      e.secondaryUnitTotal || '',
      `"${String(e.notes || '').replace(/"/g, '""')}"`,
      e.createdAt || '',
      e.completedAt || '',
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `zedarchive-export-${new Date().toISOString().split('T')[0]}.csv`);
  };

  // IMPORT FILE PARSER
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus({ state: 'loading', message: `Importing ${file.name}...` });

    try {
      const buffer = await file.arrayBuffer();
      const parsedItems = await parseImportBuffer(file.name, buffer);

      const res = await bulkImportMediaEntries(parsedItems, conflictStrategy);

      setImportStatus({
        state: 'success',
        message: `Successfully imported ${res.added} new item(s) and updated ${res.updated} item(s)! (${res.skipped} skipped)`,
      });
      onImportSuccess?.();
    } catch (err) {
      setImportStatus({
        state: 'error',
        message: err instanceof Error ? err.message : 'Failed to process import file',
      });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="data-backup-modal-title"
      title="Backup & Data Sovereignty"
      contentClassName="max-w-[42rem] rounded-small"
    >
      {/* Tab Buttons */}
      <div className="flex border-b border-decorative bg-canvas">
        <button
          type="button"
          aria-pressed={activeTab === 'export'}
          className={tabButton(activeTab === 'export')}
          onClick={() => setActiveTab('export')}
        >
          <Download size={14} className="mr-1.5 inline align-middle" />
          Export Data
        </button>
        <button
          type="button"
          aria-pressed={activeTab === 'import'}
          className={tabButton(activeTab === 'import')}
          onClick={() => setActiveTab('import')}
        >
          <Upload size={14} className="mr-1.5 inline align-middle" />
          Import Archive
        </button>
      </div>

      <div className="px-[var(--za-space-6)] py-[var(--za-space-4)]">
        {activeTab === 'export' ? (
          <div>
            <div className="mb-1 font-[var(--za-font-mono)] text-[0.65rem] uppercase tracking-[0.14em] text-accent">
              Data Sovereignty &amp; Portability
            </div>
            <p className="mb-[var(--za-space-4)] font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] leading-[var(--za-leading-body)] text-ink-muted">
              You own 100% of your data. Download your complete media entries, progress, cover art
              references, and notes at any time.
            </p>

            <div className="flex flex-col gap-[var(--za-space-3)]">
              <button
                type="button"
                className="za-bookplate flex w-full cursor-pointer items-center justify-start gap-2 p-[var(--za-space-3)] text-left transition-[border-color,transform,box-shadow] hover:-translate-y-0.5 hover:border-required"
                onClick={handleExportJSON}
              >
                <FileJson size={18} className="shrink-0 text-accent" aria-hidden="true" />
                <div className="text-left">
                  <div className="font-[var(--za-font-display)] text-[0.75rem] font-bold uppercase tracking-[0.04em] text-ink">
                    Export as JSON Backup
                  </div>
                  <div className="mt-0.5 font-[var(--za-font-serif-body)] text-xs text-ink-muted">
                    Full complete archive structure for 1-click restore
                  </div>
                </div>
              </button>

              <button
                type="button"
                className="za-bookplate flex w-full cursor-pointer items-center justify-start gap-2 p-[var(--za-space-3)] text-left transition-[border-color,transform,box-shadow] hover:-translate-y-0.5 hover:border-required"
                onClick={handleExportCSV}
              >
                <FileSpreadsheet size={18} className="shrink-0 text-accent" aria-hidden="true" />
                <div className="text-left">
                  <div className="font-[var(--za-font-display)] text-[0.75rem] font-bold uppercase tracking-[0.04em] text-ink">
                    Export as CSV Spreadsheet
                  </div>
                  <div className="mt-0.5 font-[var(--za-font-serif-body)] text-xs text-ink-muted">
                    Compatible with Excel, Google Sheets, and Notion
                  </div>
                </div>
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-1 font-[var(--za-font-mono)] text-[0.65rem] uppercase tracking-[0.14em] text-accent">
              Multi-Platform Importer
            </div>
            <p className="mb-[var(--za-space-3)] font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] leading-[var(--za-leading-body)] text-ink-muted">
              Import from ZedArchive JSON, AniList, MyAnimeList (.xml, .xml.gz), Simkl (.json),
              Letterboxd (.csv), or Goodreads (.csv).
            </p>

            {/* Conflict handling options */}
            <div className="mb-[var(--za-space-3)] rounded-small border border-decorative bg-surface-subtle p-[var(--za-space-3)]">
              <div className="mb-2 font-[var(--za-font-display)] text-[0.7rem] font-bold uppercase tracking-[0.05em] text-ink">
                If an entry already exists in your archive:
              </div>
              <div className="flex gap-[var(--za-space-4)]">
                <label className="flex cursor-pointer items-center gap-[0.35rem] font-[var(--za-font-serif-body)] text-[length:var(--za-text-fine)] text-ink">
                  <input
                    type="radio"
                    name="conflictStrategy"
                    value="skip"
                    checked={conflictStrategy === 'skip'}
                    onChange={() => setConflictStrategy('skip')}
                  />
                  Skip duplicate
                </label>
                <label className="flex cursor-pointer items-center gap-[0.35rem] font-[var(--za-font-serif-body)] text-[length:var(--za-text-fine)] text-ink">
                  <input
                    type="radio"
                    name="conflictStrategy"
                    value="overwrite"
                    checked={conflictStrategy === 'overwrite'}
                    onChange={() => setConflictStrategy('overwrite')}
                  />
                  Overwrite existing
                </label>
              </div>
            </div>

            {/* Upload Input */}
            <div className="rounded-small border-2 border-dashed border-required bg-surface-sunken p-5 text-center">
              <Upload size={25} className="mx-auto mb-2 text-accent" aria-hidden="true" />
              <div className="mb-2 font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] text-ink">
                Select a <strong>.json</strong>, <strong>.xml</strong>, <strong>.xml.gz</strong>, or{' '}
                <strong>.csv</strong> file
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.csv,.xml,.gz,.xml.gz"
                style={{ display: 'none' }}
                onChange={handleFileChange}
                aria-label="Choose backup file"
              />
              <button
                type="button"
                className="za-button za-button--primary text-xs"
                onClick={() => fileInputRef.current?.click()}
                disabled={importStatus.state === 'loading'}
              >
                {importStatus.state === 'loading' ? 'Importing...' : 'Choose File'}
              </button>
            </div>

            {/* Status feedback */}
            {importStatus.state !== 'idle' && (
              <div
                className={`mt-[var(--za-space-3)] flex items-center gap-2 rounded-small border p-[var(--za-space-3)] text-[length:var(--za-text-fine)] ${
                  importStatus.state === 'error'
                    ? 'border-danger bg-danger-surface text-danger'
                    : importStatus.state === 'success'
                      ? 'border-success bg-success-surface text-success'
                      : 'border-decorative bg-surface-subtle text-ink-muted'
                }`}
              >
                {importStatus.state === 'error' ? (
                  <AlertCircle size={16} aria-hidden="true" />
                ) : importStatus.state === 'success' ? (
                  <Check size={16} aria-hidden="true" />
                ) : (
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                )}
                <span>{importStatus.message}</span>
              </div>
            )}
          </div>
        )}

        <div className="mt-[var(--za-space-5)] flex justify-end border-t border-decorative pt-[var(--za-space-4)]">
          <button type="button" className="za-button za-button--secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
