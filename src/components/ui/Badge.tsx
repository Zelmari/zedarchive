import type { ReactNode } from 'react';
import { Star } from 'lucide-react';
import type { MediaStatus } from '@/types/media';

const STATUS_BADGE_CLASSES: Record<MediaStatus, string> = {
  in_progress: 'bg-surface-subtle border-decorative text-ink',
  completed: 'bg-[rgba(46,125,50,0.12)] border-[rgba(46,125,50,0.35)] text-[#2e7d32]',
  planning: 'bg-[rgba(100,116,139,0.12)] border-[rgba(100,116,139,0.35)] text-ink-muted',
  on_hold: 'bg-[rgba(217,119,6,0.12)] border-[rgba(217,119,6,0.35)] text-[#d97706]',
  dropped: 'bg-[rgba(225,29,72,0.1)] border-[rgba(225,29,72,0.3)] text-danger',
};

interface BadgeProps {
  children: ReactNode;
  className?: string;
}

/** Neutral meta badge (season/tag/meta chips). */
export function Badge({ children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-block rounded-small border border-decorative bg-surface-subtle px-[0.45rem] py-[0.15rem] text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] leading-[1.2] text-ink-muted ${className}`.trim()}
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
      className={`inline-block rounded-small border px-[0.45rem] py-[0.15rem] text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] leading-[1.2] ${STATUS_BADGE_CLASSES[status]}`}
    >
      {label}
    </span>
  );
}

interface RatingBadgeProps {
  rating: number;
}

/** Star-rating chip with the amber treatment from the legacy stylesheet. */
export function RatingBadge({ rating }: RatingBadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-[0.2rem] rounded-small border border-[rgba(234,179,8,0.4)] bg-[rgba(234,179,8,0.12)] px-[0.45rem] py-[0.12rem] text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-[#b45309]"
      title={`Rated ${rating}/10`}
    >
      <Star size={11} className="text-[#d97706]" fill="currentColor" />
      <span>{rating}</span>
    </span>
  );
}
