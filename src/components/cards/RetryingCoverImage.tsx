'use client';

import { useState } from 'react';
import { nextCoverSrc } from '@/lib/client/cover-retry';

interface RetryingCoverImageProps {
  src: string;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
}

export default function RetryingCoverImage({
  src,
  alt,
  className,
  loading,
}: RetryingCoverImageProps) {
  const [current, setCurrent] = useState(src);
  const [prevSrc, setPrevSrc] = useState(src);

  if (src !== prevSrc) {
    setPrevSrc(src);
    setCurrent(src);
  }

  const shown = src === prevSrc ? current : src;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- data URLs / remote covers, unoptimized by design
    <img
      src={shown}
      alt={alt}
      className={className}
      loading={loading}
      onError={() => {
        const next = nextCoverSrc(shown);
        if (next) setCurrent(next);
      }}
    />
  );
}
