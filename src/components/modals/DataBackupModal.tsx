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
  `flex-1 cursor-pointer border-none px-[var(--za-space-3)] py-[var(--za-space-3)] ${
    active
      ? 'border-b-2 border-b-ink bg-surface font-[var(--za-weight-heading)]'
      : 'bg-surface-subtle'
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
      contentClassName="max-w-[34rem]"
    >
      {/* Tab Buttons */}
      <div className="flex border-b border-decorative">
        <button
          type="button"
          className={tabButton(activeTab === 'export')}
          onClick={() => setActiveTab('export')}
        >
          <Download size={14} className="mr-1.5 inline align-middle" />
          Export Data
        </button>
        <button
          type="button"
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
            <p className="mb-[var(--za-space-4)] text-[length:var(--za-text-fine)] leading-[var(--za-leading-body)] text-ink-muted">
              You own 100% of your data. Download your complete media entries, progress, cover art
              references, and notes at any time.
            </p>

            <div className="flex flex-col gap-[var(--za-space-3)]">
              <button
                type="button"
                className="za-button za-button--secondary justify-start p-[var(--za-space-3)]"
                onClick={handleExportJSON}
              >
                <FileJson size={18} className="mr-2" />
                <div className="text-left">
                  <div className="font-[var(--za-weight-emphasis)]">Export as JSON Backup</div>
                  <div className="text-xs text-ink-muted">
                    Full complete archive structure for 1-click restore
                  </div>
                </div>
              </button>

              <button
                type="button"
                className="za-button za-button--secondary justify-start p-[var(--za-space-3)]"
                onClick={handleExportCSV}
              >
                <FileSpreadsheet size={18} className="mr-2" />
                <div className="text-left">
                  <div className="font-[var(--za-weight-emphasis)]">Export as CSV Spreadsheet</div>
                  <div className="text-xs text-ink-muted">
                    Compatible with Excel, Google Sheets, and Notion
                  </div>
                </div>
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="mb-[var(--za-space-3)] text-[length:var(--za-text-fine)] leading-[var(--za-leading-body)] text-ink-muted">
              Import from ZedArchive JSON, AniList, MyAnimeList (.xml, .xml.gz), Simkl (.json),
              Letterboxd (.csv), or Goodreads (.csv).
            </p>

            {/* Conflict handling options */}
            <div className="mb-[var(--za-space-3)] rounded-control bg-surface-subtle p-[var(--za-space-3)]">
              <div className="mb-2 text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)]">
                If an entry already exists in your archive:
              </div>
              <div className="flex gap-[var(--za-space-4)]">
                <label className="flex cursor-pointer items-center gap-[0.35rem] text-[length:var(--za-text-fine)]">
                  <input
                    type="radio"
                    name="conflictStrategy"
                    value="skip"
                    checked={conflictStrategy === 'skip'}
                    onChange={() => setConflictStrategy('skip')}
                  />
                  Skip duplicate
                </label>
                <label className="flex cursor-pointer items-center gap-[0.35rem] text-[length:var(--za-text-fine)]">
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
            <div className="rounded-layered border-2 border-dashed border-required bg-surface p-[var(--za-space-4)] text-center">
              <Upload size={24} className="mx-auto mb-2 text-ink-muted" />
              <div className="mb-2 text-[length:var(--za-text-fine)]">
                Select a <strong>.json</strong>, <strong>.xml</strong>, <strong>.xml.gz</strong>, or{' '}
                <strong>.csv</strong> file
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.csv,.xml,.gz,.xml.gz"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <button
                type="button"
                className="za-button za-button--primary"
                onClick={() => fileInputRef.current?.click()}
                disabled={importStatus.state === 'loading'}
              >
                {importStatus.state === 'loading' ? 'Importing...' : 'Choose File'}
              </button>
            </div>

            {/* Status feedback */}
            {importStatus.state !== 'idle' && (
              <div
                className={`mt-[var(--za-space-3)] flex items-center gap-2 rounded-control p-[var(--za-space-3)] text-[length:var(--za-text-fine)] ${
                  importStatus.state === 'error'
                    ? 'bg-danger-surface text-danger'
                    : importStatus.state === 'success'
                      ? 'bg-success-surface text-success'
                      : 'bg-surface-subtle text-ink-muted'
                }`}
              >
                {importStatus.state === 'error' ? (
                  <AlertCircle size={16} />
                ) : importStatus.state === 'success' ? (
                  <Check size={16} />
                ) : (
                  <Loader2 size={16} className="animate-spin" />
                )}
                <span>{importStatus.message}</span>
              </div>
            )}
          </div>
        )}

        <div className="mt-[var(--za-space-5)] flex justify-end">
          <button type="button" className="za-button za-button--secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
