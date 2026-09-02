import type { ReactNode } from 'react';
import { Star } from 'lucide-react';
import type { MediaStatus } from '@/types/media';

const STATUS_BADGE_CLASSES: Record<MediaStatus, string> = {
  in_progress: 'bg-surface-subtle border-decorative text-ink',
  completed: 'bg-success-surface border-success text-success',
  planning: 'bg-surface-subtle border-decorative text-ink-muted',
  on_hold: 'bg-warning-surface border-warning text-warning',
  dropped: 'bg-danger-surface border-danger text-danger',
};

interface BadgeProps {
  children: ReactNode;
  className?: string;
}

/** Neutral meta badge (season/tag/meta chips). */
export function Badge({ children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-block rounded-small border border-decorative bg-surface-subtle px-[0.45rem] py-[0.15rem] font-[var(--za-font-display)] text-[length:var(--za-text-fine)] font-[var(--za-weight-heading)] uppercase leading-[1.2] tracking-[0.04em] text-ink-muted ${className}`.trim()}
    >
      {children}
    </span>
  );
}

interface StatusBadgeProps {
  status: MediaStatus;
  label: string;
  title?: string;
}

/** Status-tinted badge (completed/planning/on-hold/dropped/in-progress). */
export function StatusBadge({ status, label, title }: StatusBadgeProps) {
  return (
    <span
      title={title}
      className={`inline-block rounded-small border px-[0.45rem] py-[0.15rem] font-[var(--za-font-display)] text-[length:var(--za-text-fine)] font-[var(--za-weight-heading)] uppercase leading-[1.2] tracking-[0.04em] ${STATUS_BADGE_CLASSES[status]}`}
    >
      {label}
    </span>
  );
}

interface RatingBadgeProps {
  rating: number;
}

/** Gold-ink rating stamp for catalogue highlights. */
export function RatingBadge({ rating }: RatingBadgeProps) {
  return (
    <span
      className="za-gold-stamp inline-flex items-center gap-[0.2rem] rounded-small border border-gold/40 bg-gold/10 px-[0.45rem] py-[0.12rem] font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-gold-dark"
      title={`Rated ${rating}/10`}
    >
      <Star size={11} className="text-gold" fill="currentColor" />
      <span>{rating}</span>
    </span>
  );
}
