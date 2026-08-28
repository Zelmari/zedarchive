'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Tv, Sparkles, BookOpen, Library, X, ArrowLeft } from 'lucide-react';
import { compressImageFile, fetchAndCompressRemoteImage } from '@/lib/client/image-utils';
import { useFocusTrap } from '@/hooks/use-focus-trap';
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
  rating: null,
  primaryUnitTotal: '1',
  primaryUnitCurrent: '1',
  secondaryUnitTotal: '',
  secondaryUnitCurrent: '0',
  structure: [],
  sourceId: '',
  notes: '',
  coverImage: null,
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

  const isShowLike = category === 'show' || category === 'anime';

  const resetForm = useCallback(() => {
    if (editItem) {
      const cat = editItem.category || 'show';
      setCategory(cat);
      setForm({
        title: String(editItem.title || ''),
        status: String(editItem.status || 'in_progress'),
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
      });
      setViewMode('manual');
    } else {
      setForm(EMPTY_FORM);
      setCategory(lastCategory || type || 'show');
      setViewMode('search');
    }
    setError('');
    coverRequestRef.current += 1;
  }, [editItem, type]);

  const resetAndClose = useCallback(() => {
    if (isSubmitting || isCompressing) return;
    resetForm();
    onClose();
  }, [resetForm, onClose, isSubmitting, isCompressing]);

  // Escape in search view → manual; in manual view → close.
  const handleEscape = useCallback(() => {
    if (viewMode === 'search') {
      setViewMode('manual');
    } else {
      resetAndClose();
    }
  }, [viewMode, resetAndClose]);

  const modalRef = useFocusTrap(isOpen, handleEscape, {
    initialFocusRef: titleInputRef,
  });

  // Sync form when modal opens
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on open
      resetForm();
    }
  }, [isOpen, resetForm]);

  if (!isOpen) return null;

  const setField = <K extends keyof MediaFormState>(field: K, value: MediaFormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSelectResult = async (item: SpotlightResult) => {
    const requestId = ++coverRequestRef.current;
    const selectedCategory = (item.category as MediaCategory) || category;
    if (item.category) {
      updateCategory(item.category as MediaCategory);
    }

    const isMovie = selectedCategory === 'movie';
    const itemStructure = isMovie ? [] : item.structure || [];

    setForm((prev) => {
      const primTotal = isMovie
        ? 1
        : item.primaryUnitTotal || (itemStructure.length > 0 ? itemStructure.length : 1);
      const season1 = itemStructure.find((s) => s.number === 1);
      const secTotal = isMovie
        ? (item.secondaryUnitTotal ?? '')
        : (season1?.total ?? item.secondaryUnitTotal ?? '');
      return {
        ...prev,
        title: item.title || '',
        sourceId: item.sourceId || '',
        structure: itemStructure,
        primaryUnitTotal: String(primTotal),
        primaryUnitCurrent: isMovie ? '0' : '1',
        secondaryUnitCurrent: '0',
        secondaryUnitTotal: secTotal ? String(secTotal) : '',
      };
    });

    setViewMode('manual');

    // Fetch and compress remote poster
    if (item.coverUrl) {
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
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        category,
        status: form.status,
        rating: form.rating != null ? parseInt(String(form.rating), 10) : null,
        primaryUnitCurrent: parseInt(form.primaryUnitCurrent, 10) || 1,
        primaryUnitTotal: form.primaryUnitTotal ? parseInt(form.primaryUnitTotal, 10) : 1,
        secondaryUnitCurrent: parseInt(form.secondaryUnitCurrent, 10) || 0,
        secondaryUnitTotal: form.secondaryUnitTotal ? parseInt(form.secondaryUnitTotal, 10) : null,
        structure: form.structure || [],
        coverImage: form.coverImage || null,
        sourceId: form.sourceId || null,
        notes: form.notes.trim() || null,
      };

      if (isEditMode && onSave) {
        await onSave(editItem!.id, payload);
      } else if (onAdd) {
        await onAdd(payload);
      }
      resetAndClose();
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
    <div
      className="animate-fade-in fixed inset-0 z-[var(--za-layer-modal)] flex items-center justify-center bg-backdrop p-[var(--za-space-4)]"
      onClick={resetAndClose}
    >
      <div
        ref={modalRef}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-layered border border-required bg-surface shadow-layered"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-media-modal-title"
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
      </div>
    </div>
  );
}
