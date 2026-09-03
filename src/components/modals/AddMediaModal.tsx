'use client';

import { useState, useEffect } from 'react';
import { fetchAndCompressRemoteImage } from '@/lib/client/image-utils';
import SpotlightSearchModal, {
  type SpotlightResult,
} from '@/components/modals/SpotlightSearchModal';
import type { MediaCategory } from '@/types/media';

// Persist the last-used category across modal open/close within this page session
let lastCategory: MediaCategory | null = null;

interface AddMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  type?: MediaCategory;
  onAdd: (payload: Record<string, unknown>) => Promise<unknown>;
  onCreated?: (entry: unknown) => void;
}

/**
 * Search-only create-then-folio flow.
 * Mounts SpotlightSearchModal and stub-creates or commits the selected search result,
 * then closes and reports the created entry via onCreated.
 */
export default function AddMediaModal({
  isOpen,
  onClose,
  type = 'show',
  onAdd,
  onCreated,
}: AddMediaModalProps) {
  const initialCategory: MediaCategory = type ?? 'show';
  const [category, setCategory] = useState<MediaCategory>(() => lastCategory || initialCategory);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState('');

  const updateCategory = (next: MediaCategory) => {
    lastCategory = next;
    setCategory(next);
  };

  useEffect(() => {
    if (isOpen) {
      if (lastCategory) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- sync category on open
        setCategory(lastCategory);
      } else if (type) {
        setCategory(type);
      }
      setCreateError('');
    }
  }, [isOpen, type]);

  if (!isOpen) return null;

  const handleClose = () => {
    if (isSubmitting) return;
    setCreateError('');
    onClose();
  };

  const handleSelectResult = async (item: SpotlightResult) => {
    if (isSubmitting) return;
    if (!onAdd) {
      console.error('onAdd is required');
      return;
    }

    const isMovie = category === 'movie';
    const rawPrimaryTot = item.primaryUnitTotal != null ? item.primaryUnitTotal : 1;
    const parsedPrimaryTot = parseInt(String(rawPrimaryTot), 10);
    const primaryUnitTotal = isNaN(parsedPrimaryTot) ? 1 : Math.max(1, parsedPrimaryTot);
    const primaryUnitCurrent = isMovie ? 0 : 1;

    let secondaryUnitTotal: number | null = null;
    if (item.secondaryUnitTotal != null && String(item.secondaryUnitTotal).trim() !== '') {
      const parsedSecTot = parseInt(String(item.secondaryUnitTotal), 10);
      if (!isNaN(parsedSecTot)) {
        secondaryUnitTotal = Math.max(0, parsedSecTot);
      }
    }
    const secondaryUnitCurrent = 0;

    setIsSubmitting(true);
    setCreateError('');

    let coverImage: string | null = item.coverUrl || null;
    if (item.coverUrl) {
      try {
        const compressedBase64 = await fetchAndCompressRemoteImage(item.coverUrl, 320, 480, 0.7);
        if (compressedBase64) {
          coverImage = compressedBase64;
        }
      } catch (imgErr) {
        console.warn('Failed to compress remote cover:', imgErr);
        coverImage = item.coverUrl;
      }
    }

    const payload: Record<string, unknown> = {
      title: (item.title || '').trim(),
      category,
      status: 'in_progress',
      dropReason: null,
      rating: null,
      primaryUnitCurrent,
      primaryUnitTotal,
      secondaryUnitCurrent,
      secondaryUnitTotal,
      structure: item.structure || [],
      sourceId: item.sourceId || null,
      notes: null,
      coverImage,
      isPrivate: false,
    };

    try {
      const created = await onAdd(payload);
      onClose();
      if (created && typeof created === 'object') {
        onCreated?.(created);
      }
    } catch (err) {
      console.error('Failed to create entry from search:', err);
      setCreateError(err instanceof Error ? err.message : 'Failed to create entry');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualEnter = async (query: string) => {
    if (isSubmitting) return;
    if (!onAdd) {
      console.error('onAdd is required');
      return;
    }

    const isMovie = category === 'movie';
    const payload: Record<string, unknown> = {
      title: query.trim(),
      category,
      status: 'in_progress',
      dropReason: null,
      rating: null,
      primaryUnitCurrent: isMovie ? 0 : 1,
      primaryUnitTotal: 1,
      secondaryUnitCurrent: 0,
      secondaryUnitTotal: null,
      structure: [],
      sourceId: null,
      notes: null,
      coverImage: null,
      isPrivate: false,
    };

    try {
      setIsSubmitting(true);
      setCreateError('');
      const created = await onAdd(payload);
      onClose();
      if (created && typeof created === 'object') {
        onCreated?.(created);
      }
    } catch (err) {
      console.error('Failed to create entry manually:', err);
      setCreateError(err instanceof Error ? err.message : 'Failed to create entry');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {(createError || isSubmitting) && (
        <div
          role={createError ? 'alert' : 'status'}
          className={`fixed top-4 left-1/2 z-[70] max-w-md -translate-x-1/2 rounded-md border px-4 py-2 text-xs font-[var(--za-weight-emphasis)] shadow-lg backdrop-blur ${
            createError
              ? 'border-danger/40 bg-danger/10 text-danger'
              : 'border-decorative bg-surface text-ink'
          }`}
        >
          {createError || 'Adding to archive…'}
        </div>
      )}
      <SpotlightSearchModal
        isOpen={isOpen}
        category={category}
        onCategoryChange={updateCategory}
        onClose={handleClose}
        onManualEnter={handleManualEnter}
        onSelectResult={handleSelectResult}
      />
    </>
  );
}
