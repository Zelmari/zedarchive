'use client';

import { useState } from 'react';
import { FileText } from 'lucide-react';
import { MAX_NOTES_LENGTH } from '@/lib/constants';
import { MarkdownNotes } from '@/lib/markdown';

interface FolioNotesProps {
  notesDraft: string;
  onNotesChange: (val: string) => void;
  onNotesBlur: () => void;
  sectionLabelClass?: string;
  disabled?: boolean;
}

export default function FolioNotes({
  notesDraft,
  onNotesChange,
  onNotesBlur,
  sectionLabelClass = 'mb-2 flex items-center gap-1 border-b border-decorative pb-1 font-[var(--za-font-display)] text-[length:var(--za-text-fine)] font-[var(--za-weight-heading)] uppercase tracking-[0.1em] text-ink',
  disabled = false,
}: FolioNotesProps) {
  const [notesTab, setNotesTab] = useState<'write' | 'preview'>('write');

  return (
    <div className="mt-[var(--za-space-4)]">
      <div className="mb-1.5 flex items-center justify-between">
        <div className={sectionLabelClass}>
          <FileText size={12} /> PERSONAL NOTES
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setNotesTab('write')}
            className={`rounded-small px-2 py-0.5 text-xs font-[var(--za-weight-emphasis)] transition-[all] ${
              notesTab === 'write'
                ? 'border border-required bg-surface text-ink'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            Write
          </button>
          <button
            type="button"
            onClick={() => setNotesTab('preview')}
            className={`rounded-small px-2 py-0.5 text-xs font-[var(--za-weight-emphasis)] transition-[all] ${
              notesTab === 'preview'
                ? 'border border-accent bg-accent/15 text-accent'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            Preview
          </button>
        </div>
      </div>

      {notesTab === 'write' ? (
        <textarea
          id="folio-notes"
          aria-label="Personal notes"
          rows={3}
          maxLength={MAX_NOTES_LENGTH}
          placeholder="Thoughts, quotes, or markdown notes (supports **bold**, *italic*, > quotes, - lists)..."
          value={notesDraft}
          disabled={disabled}
          onChange={(e) => onNotesChange(e.target.value)}
          onBlur={onNotesBlur}
          style={{ resize: 'vertical', minHeight: '5rem' }}
          className="za-field text-xs"
        />
      ) : (
        <div className="min-h-[5rem] rounded-control border border-decorative bg-surface-subtle p-3 text-xs">
          {notesDraft.trim() ? (
            <MarkdownNotes content={notesDraft} />
          ) : (
            <span className="italic text-ink-muted">Nothing to preview yet.</span>
          )}
        </div>
      )}
    </div>
  );
}
