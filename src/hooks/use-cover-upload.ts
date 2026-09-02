'use client';

import { useState, useRef, useCallback, useMemo, type RefObject, type ChangeEvent } from 'react';
import { compressImageFile } from '@/lib/client/image-utils';

export interface UseCoverUploadOptions {
  onCoverChange: (coverImage: string | null) => void | Promise<void>;
}

export interface UseCoverUploadReturn {
  fileInputRef: RefObject<HTMLInputElement | null>;
  isCompressing: boolean;
  error: string;
  clearError: () => void;
  openFilePicker: () => void;
  handleImageUpload: (e: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleImageRemove: () => Promise<void>;
  fileInputProps: {
    ref: RefObject<HTMLInputElement | null>;
    type: 'file';
    accept: 'image/jpeg,image/png,image/webp';
    className: 'hidden';
    onChange: (e: ChangeEvent<HTMLInputElement>) => Promise<void>;
  };
}

/**
 * Client hook for handling media cover art uploading, canvas compression, and removal.
 */
export function useCoverUpload(options: UseCoverUploadOptions): UseCoverUploadReturn {
  const { onCoverChange } = options;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [error, setError] = useState('');

  const clearError = useCallback(() => {
    setError('');
  }, []);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImageUpload = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        return;
      }

      setError('');
      setIsCompressing(true);

      try {
        const compressedDataUrl = await compressImageFile(file, 320, 480, 0.7);
        await onCoverChange(compressedDataUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to process image');
      } finally {
        setIsCompressing(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        e.target.value = '';
      }
    },
    [onCoverChange],
  );

  const handleImageRemove = useCallback(async () => {
    try {
      await onCoverChange(null);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [onCoverChange]);

  const fileInputProps = useMemo(
    () => ({
      ref: fileInputRef,
      type: 'file' as const,
      accept: 'image/jpeg,image/png,image/webp' as const,
      className: 'hidden' as const,
      'aria-label': 'Upload cover image',
      onChange: handleImageUpload,
    }),
    [handleImageUpload],
  );

  return {
    fileInputRef,
    isCompressing,
    error,
    clearError,
    openFilePicker,
    handleImageUpload,
    handleImageRemove,
    fileInputProps,
  };
}
