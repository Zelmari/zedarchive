'use client';

import { getTileInitials } from '@/lib/format';
import type { UseCoverUploadReturn } from '@/hooks/use-cover-upload';

interface FolioCoverProps {
  coverImage: string | null;
  title: string;
  sourceId?: string | null;
  isCompressing: boolean;
  isUpdating: boolean;
  error?: string;
  onOpenFilePicker: () => void;
  onRemoveCover: () => Promise<void> | void;
  fileInputProps: UseCoverUploadReturn['fileInputProps'];
}

export default function FolioCover({
  coverImage,
  title,
  sourceId,
  isCompressing,
  isUpdating,
  error,
  onOpenFilePicker,
  onRemoveCover,
  fileInputProps,
}: FolioCoverProps) {
  return (
    <div className="mx-auto w-full max-w-[18rem] border border-required bg-surface p-2 shadow-raised">
      <div className="group relative aspect-[2/3] overflow-hidden border border-decorative bg-surface-subtle">
        {isCompressing ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface p-4 text-center">
            <span className="font-[var(--za-font-mono)] text-xs text-ink-muted">Compressing…</span>
          </div>
        ) : coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URLs / remote covers, unoptimized by design
          <img src={coverImage} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div
            className="flex h-full w-full cursor-pointer items-center justify-center font-bold text-[1.5rem] select-none hover:bg-surface-hover transition-colors"
            onClick={onOpenFilePicker}
            title="Upload custom cover image"
          >
            {getTileInitials(title)}
          </div>
        )}

        {/* Overlay hit targets on the matte: Replace (opens file picker) and Remove (only if cover exists) */}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-black/80 via-black/50 to-transparent p-2 opacity-100 transition-opacity duration-[var(--za-motion-fast)] md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
          <button
            type="button"
            onClick={onOpenFilePicker}
            disabled={isCompressing || isUpdating}
            className="za-button za-button--secondary min-h-0 bg-surface/90 px-2.5 py-1 text-[11px] backdrop-blur-sm hover:bg-surface"
          >
            {coverImage ? 'Replace' : 'Upload'}
          </button>
          {coverImage && (
            <button
              type="button"
              onClick={() => void onRemoveCover()}
              disabled={isCompressing || isUpdating}
              className="za-button za-button--secondary min-h-0 bg-surface/90 px-2.5 py-1 text-[11px] text-danger backdrop-blur-sm hover:bg-danger-surface hover:text-danger"
            >
              Remove
            </button>
          )}
        </div>

        <input {...fileInputProps} />
      </div>

      {error && (
        <p className="mt-1 text-center text-xs text-danger" role="alert">
          {error}
        </p>
      )}

      {sourceId && (
        <div className="mt-2 text-center font-[var(--za-font-mono)] text-[10px] text-ink-muted">
          Linked · {sourceId}
        </div>
      )}
    </div>
  );
}
