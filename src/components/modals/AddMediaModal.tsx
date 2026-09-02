'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Tv, Sparkles, BookOpen, Library, X, ArrowLeft } from 'lucide-react';
import { compressImageFile, fetchAndCompressRemoteImage } from '@/lib/client/image-utils';
import Modal from '@/components/ui/Modal';
import SpotlightSearchModal, {
  type SpotlightResult,
} from '@/components/modals/SpotlightSearchModal';
import MediaEditForm, { type MediaFormState } from '@/components/forms/MediaEditForm';
import type { MediaCategory, MediaEntry } from '@/types/media';

// Persist the last-used category across modal open/close within this page session
let lastCategory: MediaCategory | null = null;

const EMPTY_FORM: MediaFormState = {
  title: '',
  status: 'in_progress',
  dropReason: '',
  rating: null,
  primaryUnitTotal: '1',
  primaryUnitCurrent: '1',
  secondaryUnitTotal: '',
  secondaryUnitCurrent: '0',
  structure: [],
  sourceId: '',
  notes: '',
  coverImage: null,
  isPrivate: false,
};

interface AddMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  type?: MediaCategory;
  onAdd?: (payload: Record<string, unknown>) => Promise<unknown>;
  editItem?: MediaEntry | null;
  onSave?: ((id: string, payload: Record<string, unknown>) => Promise<unknown>) | null;
}

/**
 * Orchestrator for media creation/editing. Delegates the spotlight search
 * view and the manual form to dedicated components.
 */
export default function AddMediaModal({
  isOpen,
  onClose,
  type = 'show',
  onAdd,
  editItem = null,
  onSave = null,
}: AddMediaModalProps) {
  const isEditMode = !!editItem;
  const initialCategory: MediaCategory = type ?? 'show';
  const [category, setCategory] = useState<MediaCategory>(() => lastCategory || initialCategory);
  const updateCategory = (next: MediaCategory) => {
    lastCategory = next;
    setCategory(next);
  };

  // View Mode: 'search' (Spotlight-first) or 'manual' (Full form)
  const [viewMode, setViewMode] = useState<'search' | 'manual'>(() =>
    isEditMode ? 'manual' : 'search',
  );

  // Form state
  const [form, setForm] = useState<MediaFormState>(EMPTY_FORM);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverRequestRef = useRef(0);

  const resetForm = useCallback(() => {
    if (editItem) {
      const cat = editItem.category || 'show';
      setCategory(cat);
      setForm({
        title: String(editItem.title || ''),
        status: String(editItem.status || 'in_progress'),
        dropReason: String(editItem.dropReason || ''),
        rating: editItem.rating != null ? Number(editItem.rating) : null,
        primaryUnitTotal:
          editItem.primaryUnitTotal != null ? String(editItem.primaryUnitTotal) : '',
        primaryUnitCurrent:
          editItem.primaryUnitCurrent != null
            ? String(editItem.primaryUnitCurrent)
            : cat === 'movie'
              ? '0'
              : '1',
        secondaryUnitTotal:
          editItem.secondaryUnitTotal != null ? String(editItem.secondaryUnitTotal) : '',
        secondaryUnitCurrent:
          editItem.secondaryUnitCurrent != null ? String(editItem.secondaryUnitCurrent) : '0',
        structure: Array.isArray(editItem.structure) ? editItem.structure : [],
        sourceId: String(editItem.sourceId || ''),
        notes: String(editItem.notes || ''),
        coverImage: (editItem.coverImage as string | null) || null,
        isPrivate: Boolean(editItem.isPrivate),
      });
    } else {
      setCategory(initialCategory);
      setForm(EMPTY_FORM);
    }
  }, [editItem, initialCategory]);

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on open
      resetForm();
      setViewMode(isEditMode ? 'manual' : 'search');
      setError('');
    }
  }, [isOpen, resetForm, isEditMode]);

  const resetAndClose = useCallback(() => {
    if (isSubmitting || isCompressing) return;
    setError('');
    onClose();
  }, [onClose, isSubmitting, isCompressing]);

  if (!isOpen) return null;

  const setField = <K extends keyof MediaFormState>(field: K, value: MediaFormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSelectResult = async (item: SpotlightResult) => {
    const isMovie = category === 'movie';

    setForm({
      title: item.title || '',
      status: 'in_progress',
      dropReason: '',
      rating: null,
      primaryUnitTotal: String(item.primaryUnitTotal || 1),
      primaryUnitCurrent: isMovie ? '0' : '1',
      secondaryUnitTotal: item.secondaryUnitTotal ? String(item.secondaryUnitTotal) : '',
      secondaryUnitCurrent: '0',
      structure: item.structure || [],
      sourceId: item.sourceId || '',
      notes: '',
      coverImage: item.coverUrl || null,
      isPrivate: false,
    });
    setViewMode('manual');

    // Fetch and compress remote poster
    if (item.coverUrl) {
      const requestId = ++coverRequestRef.current;
      setIsCompressing(true);
      try {
        const compressedBase64 = await fetchAndCompressRemoteImage(item.coverUrl, 320, 480, 0.7);
        if (coverRequestRef.current !== requestId) return;
        setForm((prev) => ({ ...prev, coverImage: compressedBase64 || item.coverUrl || null }));
      } catch (imgErr) {
        console.warn('Failed to compress remote cover:', imgErr);
        if (coverRequestRef.current !== requestId) return;
        setForm((prev) => ({ ...prev, coverImage: item.coverUrl || null }));
      } finally {
        if (coverRequestRef.current === requestId) {
          setIsCompressing(false);
        }
      }
    }
  };

  // =========================================================================
  // VIEW MODE 1: SPOTLIGHT SEARCH-FIRST WINDOW
  // =========================================================================
  if (viewMode === 'search') {
    // Spotlight owns Escape and closes the complete add flow; AddMedia only
    // mounts its own Modal for the manual view so one focus trap is active.
    return (
      <SpotlightSearchModal
        isOpen
        category={category}
        onCategoryChange={updateCategory}
        onClose={resetAndClose}
        onManualEnter={(query) => {
          setForm((prev) => ({
            ...prev,
            title: query || prev.title || '',
            primaryUnitCurrent: category === 'movie' ? '0' : '1',
            primaryUnitTotal: category === 'movie' ? '1' : prev.primaryUnitTotal,
            secondaryUnitCurrent: '0',
          }));
          setViewMode('manual');
        }}
        onSelectResult={handleSelectResult}
      />
    );
  }

  // =========================================================================
  // VIEW MODE 2: FULL EDIT / MANUAL CREATION VIEW
  // =========================================================================
  const handlePrimaryUnitChange = (val: string) => {
    setField('primaryUnitCurrent', val);
    const seasonNum = parseInt(val, 10);
    if (!isNaN(seasonNum) && form.structure.length > 0) {
      const seasonObj = form.structure.find((s) => s.number === seasonNum);
      if (seasonObj && seasonObj.total !== null && seasonObj.total !== undefined) {
        setField('secondaryUnitTotal', String(seasonObj.total));
        return;
      }
    }
    setField('secondaryUnitTotal', '');
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setIsCompressing(true);
    try {
      const compressedDataUrl = await compressImageFile(file, 320, 480, 0.7);
      setField('coverImage', compressedDataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process image');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleImageRemove = () => {
    setField('coverImage', null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError('Please enter a title');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const parsedPrimaryCur = parseInt(form.primaryUnitCurrent, 10);
      const parsedPrimaryTot =
        form.primaryUnitTotal && String(form.primaryUnitTotal).trim()
          ? parseInt(String(form.primaryUnitTotal), 10)
          : null;
      const parsedSecCur = parseInt(form.secondaryUnitCurrent, 10);
      const parsedSecTot =
        form.secondaryUnitTotal && String(form.secondaryUnitTotal).trim()
          ? parseInt(String(form.secondaryUnitTotal), 10)
          : null;

      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        category,
        status: form.status,
        dropReason:
          form.status === 'dropped' && form.dropReason?.trim() ? form.dropReason.trim() : null,
        rating: form.rating != null ? parseInt(String(form.rating), 10) : null,
        primaryUnitCurrent: isNaN(parsedPrimaryCur)
          ? category === 'movie'
            ? 0
            : 1
          : Math.max(category === 'movie' ? 0 : 1, parsedPrimaryCur),
        primaryUnitTotal:
          parsedPrimaryTot === null || isNaN(parsedPrimaryTot)
            ? null
            : Math.max(1, parsedPrimaryTot),
        secondaryUnitCurrent: isNaN(parsedSecCur) ? 0 : Math.max(0, parsedSecCur),
        secondaryUnitTotal:
          parsedSecTot === null || isNaN(parsedSecTot) ? null : Math.max(0, parsedSecTot),
        structure: form.structure || [],
        coverImage: form.coverImage || null,
        sourceId: form.sourceId || null,
        notes: form.notes.trim() || null,
        isPrivate: Boolean(form.isPrivate),
      };

      if (isEditMode && onSave) {
        await onSave(editItem!.id, payload);
      } else if (onAdd) {
        await onAdd(payload);
      }
      setError('');
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isEditMode
            ? 'Failed to update entry'
            : 'Failed to create entry',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const headerCloseBtn = (
    <button
      type="button"
      onClick={resetAndClose}
      aria-label="Close modal"
      className="flex cursor-pointer items-center justify-center rounded-small p-[var(--za-space-1)] text-ink-muted hover:text-ink"
    >
      <X size={18} strokeWidth={2} />
    </button>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={resetAndClose}
      labelledBy="add-media-modal-title"
      initialFocusRef={titleInputRef}
      contentClassName="max-w-2xl overflow-y-auto"
    >
      <div className="flex items-center justify-between border-b border-decorative px-[var(--za-space-6)] py-[var(--za-space-4)]">
        {!isEditMode && (
          <button
            type="button"
            onClick={() => setViewMode('search')}
            className="flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-[length:var(--za-text-supporting)] text-ink-muted hover:text-ink"
          >
            <ArrowLeft size={14} />
            <span>Back to Search</span>
          </button>
        )}
        <h2
          id="add-media-modal-title"
          className="text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] text-ink"
        >
          {isEditMode ? 'Edit Entry' : 'Manual Entry'}
        </h2>
        {headerCloseBtn}
      </div>

      <MediaEditForm
        isEditMode={isEditMode}
        category={category}
        onCategoryChange={updateCategory}
        titleInputRef={titleInputRef}
        form={form}
        onFieldChange={(field, value) => setField(field, value)}
        onPrimaryUnitCurrentChange={handlePrimaryUnitChange}
        onImageUpload={handleImageUpload}
        onImageRemove={handleImageRemove}
        isCompressing={isCompressing}
        isSubmitting={isSubmitting}
        error={error}
        onSubmit={handleSubmit}
        onCancel={resetAndClose}
      />
    </Modal>
  );
}
