'use client';

import { useState, useRef } from 'react';
import { X, Download, Upload, FileJson, FileSpreadsheet, Check, AlertCircle } from 'lucide-react';
import { useFocusTrap } from '@/lib/hooks/useFocusTrap';
import { bulkImportMediaEntries } from './actions';
import styles from './dashboard.module.css';

export default function DataBackupModal({ isOpen, onClose, entries = [], onImportSuccess }) {
  const modalRef = useFocusTrap(isOpen, onClose);
  const [activeTab, setActiveTab] = useState('export'); // 'export' | 'import'
  const [conflictStrategy, setConflictStrategy] = useState('skip'); // 'skip' | 'overwrite'
  const [importStatus, setImportStatus] = useState({ state: 'idle', message: '', result: null });
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  // EXPORT JSON
  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(entries, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `zedarchive-backup-${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // EXPORT CSV
  const handleExportCSV = () => {
    const headers = [
      'Title',
      'Category',
      'Status',
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
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `zedarchive-export-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // IMPORT FILE PARSER
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus({ state: 'loading', message: `Parsing ${file.name}...`, result: null });

    try {
      const text = await file.text();
      let parsedItems = [];

      if (file.name.endsWith('.json')) {
        const json = JSON.parse(text);
        if (Array.isArray(json)) {
          parsedItems = json;
        } else if (json.data && Array.isArray(json.data.MediaListCollection?.lists)) {
          // AniList export format
          json.data.MediaListCollection.lists.forEach((list) => {
            (list.entries || []).forEach((item) => {
              parsedItems.push({
                title: item.media?.title?.english || item.media?.title?.romaji || 'Untitled',
                category: item.media?.type === 'MANGA' ? 'manga' : 'anime',
                status: item.status === 'COMPLETED' ? 'completed' : 'in_progress',
                secondaryUnitCurrent: item.progress || 0,
                secondaryUnitTotal: item.media?.episodes || item.media?.chapters || null,
                coverImage: item.media?.coverImage?.large || null,
                notes: item.notes || null,
                rating: item.score ? Math.round(item.score / 10) : null,
              });
            });
          });
        } else {
          throw new Error('Unrecognized JSON format. Please upload a ZedArchive backup or supported export.');
        }
      } else if (file.name.endsWith('.csv')) {
        // Simple CSV parser
        const lines = text.split(/\r?\n/).filter(Boolean);
        if (lines.length <= 1) throw new Error('CSV file is empty');
        const header = lines[0].toLowerCase();
        
        // Goodreads CSV format
        if (header.includes('book id') || header.includes('title')) {
          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            if (cols.length >= 2) {
              const cleanTitle = cols[1]?.replace(/^"|"$/g, '').trim();
              if (cleanTitle) {
                parsedItems.push({
                  title: cleanTitle,
                  category: 'book',
                  status: 'in_progress',
                  primaryUnitCurrent: 1,
                  primaryUnitTotal: 1,
                  secondaryUnitCurrent: 0,
                  secondaryUnitTotal: null,
                });
              }
            }
          }
        }
      }

      if (parsedItems.length === 0) {
        throw new Error('No valid entries could be parsed from the file.');
      }

      setImportStatus({ state: 'loading', message: `Importing ${parsedItems.length} items to your archive...`, result: null });
      const res = await bulkImportMediaEntries(parsedItems, conflictStrategy);

      setImportStatus({
        state: 'success',
        message: `Successfully imported ${res.added} new item(s) and updated ${res.updated} item(s)! (${res.skipped} skipped)`,
        result: res,
      });

      if (onImportSuccess) {
        onImportSuccess();
      }
    } catch (err) {
      console.error('Import error:', err);
      setImportStatus({ state: 'error', message: err.message || 'Failed to process import file', result: null });
    }
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div
        ref={modalRef}
        className={`${styles.modalContent} ${styles.importModalContent}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="data-backup-modal-title"
      >
        <div className={styles.modalHeader}>
          <h2 id="data-backup-modal-title" className={styles.modalTitle}>
            Data Sovereignty & Backups
          </h2>
          <button
            type="button"
            className={styles.modalCloseBtn}
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Tab Buttons */}
        <div style={{ display: 'flex', borderBottom: 'var(--za-border-width) solid var(--za-color-border-decorative)' }}>
          <button
            type="button"
            style={{
              flex: 1,
              padding: 'var(--za-space-3)',
              background: activeTab === 'export' ? 'var(--za-color-surface)' : 'var(--za-color-surface-subtle)',
              border: 'none',
              borderBottom: activeTab === 'export' ? '2px solid var(--za-color-text)' : 'none',
              fontWeight: activeTab === 'export' ? 'var(--za-weight-heading)' : 'normal',
              cursor: 'pointer',
            }}
            onClick={() => setActiveTab('export')}
          >
            <Download size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
            Export Data
          </button>
          <button
            type="button"
            style={{
              flex: 1,
              padding: 'var(--za-space-3)',
              background: activeTab === 'import' ? 'var(--za-color-surface)' : 'var(--za-color-surface-subtle)',
              border: 'none',
              borderBottom: activeTab === 'import' ? '2px solid var(--za-color-text)' : 'none',
              fontWeight: activeTab === 'import' ? 'var(--za-weight-heading)' : 'normal',
              cursor: 'pointer',
            }}
            onClick={() => setActiveTab('import')}
          >
            <Upload size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
            Import Archive
          </button>
        </div>

        <div style={{ padding: 'var(--za-space-4) var(--za-space-6)' }}>
          {activeTab === 'export' ? (
            <div>
              <p style={{ fontSize: 'var(--za-text-fine)', color: 'var(--za-color-text-muted)', marginBottom: 'var(--za-space-4)', lineHeight: 'var(--za-leading-body)' }}>
                You own 100% of your data. Download your complete media entries, progress, cover art references, and notes at any time.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--za-space-3)' }}>
                <button
                  type="button"
                  className="za-button za-button--secondary"
                  style={{ justifyContent: 'flex-start', padding: 'var(--za-space-3)' }}
                  onClick={handleExportJSON}
                >
                  <FileJson size={18} style={{ marginRight: 8 }} />
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 'var(--za-weight-emphasis)' }}>Export as JSON Backup</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--za-color-text-muted)' }}>Full complete archive structure for 1-click restore</div>
                  </div>
                </button>

                <button
                  type="button"
                  className="za-button za-button--secondary"
                  style={{ justifyContent: 'flex-start', padding: 'var(--za-space-3)' }}
                  onClick={handleExportCSV}
                >
                  <FileSpreadsheet size={18} style={{ marginRight: 8 }} />
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 'var(--za-weight-emphasis)' }}>Export as CSV Spreadsheet</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--za-color-text-muted)' }}>Compatible with Excel, Google Sheets, and Notion</div>
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: 'var(--za-text-fine)', color: 'var(--za-color-text-muted)', marginBottom: 'var(--za-space-3)', lineHeight: 'var(--za-leading-body)' }}>
                Restore from a previous ZedArchive JSON backup, or import from AniList, MyAnimeList, or Goodreads.
              </p>

              {/* Conflict handling options */}
              <div style={{ marginBottom: 'var(--za-space-3)', padding: 'var(--za-space-3)', background: 'var(--za-color-surface-subtle)', borderRadius: 'var(--za-radius-control)' }}>
                <div style={{ fontSize: 'var(--za-text-fine)', fontWeight: 'var(--za-weight-emphasis)', marginBottom: 'var(--za-space-2)' }}>
                  If an entry already exists in your archive:
                </div>
                <div style={{ display: 'flex', gap: 'var(--za-space-4)' }}>
                  <label style={{ fontSize: 'var(--za-text-fine)', display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="conflictStrategy"
                      value="skip"
                      checked={conflictStrategy === 'skip'}
                      onChange={() => setConflictStrategy('skip')}
                    />
                    Skip duplicate
                  </label>
                  <label style={{ fontSize: 'var(--za-text-fine)', display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
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
              <div style={{ textAlign: 'center', padding: 'var(--za-space-4)', border: '2px dashed var(--za-color-border-required)', borderRadius: 'var(--za-radius-layered)', backgroundColor: 'var(--za-color-surface)' }}>
                <Upload size={24} style={{ color: 'var(--za-color-text-muted)', marginBottom: 'var(--za-space-2)' }} />
                <div style={{ fontSize: 'var(--za-text-fine)', marginBottom: 'var(--za-space-2)' }}>
                  Select a <strong>.json</strong> or <strong>.csv</strong> file to import
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.csv"
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
                  style={{
                    marginTop: 'var(--za-space-3)',
                    padding: 'var(--za-space-3)',
                    borderRadius: 'var(--za-radius-control)',
                    fontSize: 'var(--za-text-fine)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    backgroundColor: importStatus.state === 'error' ? 'var(--za-color-error-surface)' : 'rgba(46, 125, 50, 0.1)',
                    color: importStatus.state === 'error' ? 'var(--za-color-destructive)' : '#2e7d32',
                  }}
                >
                  {importStatus.state === 'error' ? <AlertCircle size={16} /> : <Check size={16} />}
                  <span>{importStatus.message}</span>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--za-space-5)' }}>
            <button type="button" className="za-button za-button--secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
