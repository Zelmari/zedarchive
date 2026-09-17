import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface PageIntroProps {
  kicker?: string;
  title: string;
  description?: ReactNode;
  meta?: ReactNode;
  align?: 'start' | 'center';
}

export default function PageIntro({
  kicker,
  title,
  description,
  meta,
  align = 'start',
}: PageIntroProps) {
  const centered = align === 'center';

  return (
    <header className={cn('za-page-intro', centered && 'text-center')}>
      {kicker && <p className="za-kicker mb-2">{kicker}</p>}
      <div className={cn('flex flex-col gap-1', centered && 'items-center')}>
        <h1 className="break-words font-[var(--za-font-display)] text-[length:var(--za-text-heading-lg)] font-[var(--za-weight-heading)] uppercase tracking-[0.04em] text-ink">
          {title}
        </h1>
        {meta && (
          <div className="font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] uppercase tracking-[0.08em] text-ink-faint">
            {meta}
          </div>
        )}
        {description && (
          <p
            className={cn(
              'mt-2 max-w-xl font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] leading-[var(--za-leading-body)] text-ink-muted',
              centered && 'mx-auto',
            )}
          >
            {description}
          </p>
        )}
      </div>
    </header>
  );
}
