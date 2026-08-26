'use client';

import { Tv, BookOpen, Star, BarChart2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { RatingBadge } from '@/components/ui/Badge';
import type { MediaEntry } from '@/types/media';

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries?: MediaEntry[];
}

const sectionTitle =
  'mb-2 text-xs font-[var(--za-weight-heading)] uppercase tracking-[0.05em] text-ink-muted';

const statCard =
  'flex flex-col items-center rounded-control border border-decorative bg-surface-subtle px-2 py-3 text-center';

const statValue = 'text-[1.35rem] font-[var(--za-weight-heading)] leading-[1.2] text-ink';

const statLabel = 'mt-1 text-xs leading-[1.3] text-ink-muted';

export default function StatsModal({ isOpen, onClose, entries = [] }: StatsModalProps) {
  const totalEntries = entries.length;
  const showEntries = entries.filter((e) => e.category === 'show' || e.category === 'anime');
  const bookEntries = entries.filter((e) => e.category === 'book' || e.category === 'manga');

  const completedEntries = entries.filter((e) => e.status === 'completed');
  const inProgressEntries = entries.filter((e) => !e.status || e.status === 'in_progress');
  const planningEntries = entries.filter((e) => e.status === 'planning');

  const totalEpisodes = showEntries.reduce((sum, e) => sum + (e.secondaryUnitCurrent || 0), 0);
  const totalChapters = bookEntries.reduce((sum, e) => sum + (e.secondaryUnitCurrent || 0), 0);

  const ratedEntries = entries.filter((e) => e.rating != null && e.rating > 0);
  const avgRating =
    ratedEntries.length > 0
      ? (ratedEntries.reduce((sum, e) => sum + (e.rating ?? 0), 0) / ratedEntries.length).toFixed(1)
      : '—';

  const completionRate =
    totalEntries > 0 ? Math.round((completedEntries.length / totalEntries) * 100) : 0;

  const topRated = [...ratedEntries].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 4);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="stats-modal-title"
      title="Archive Statistics"
      icon={<BarChart2 size={18} />}
      contentClassName="max-w-[38rem]"
    >
      <div className="px-[var(--za-space-6)] py-[var(--za-space-4)]">
        <div className={sectionTitle}>Collection Status</div>
        <div className="mb-[var(--za-space-4)] grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-[var(--za-space-3)]">
          <div className={statCard}>
            <div className={statValue}>{totalEntries}</div>
            <div className={statLabel}>Total Titles</div>
          </div>
          <div className={statCard}>
            <div className={statValue} style={{ color: '#2e7d32' }}>
              {completedEntries.length}
            </div>
            <div className={statLabel}>Completed ({completionRate}%)</div>
          </div>
          <div className={statCard}>
            <div className={statValue}>{inProgressEntries.length}</div>
            <div className={statLabel}>In Progress</div>
          </div>
          <div className={statCard}>
            <div className={statValue}>{planningEntries.length}</div>
            <div className={statLabel}>Planning</div>
          </div>
        </div>

        <div className={`${sectionTitle} mt-[var(--za-space-3)]`}>Activity & Ratings</div>
        <div className="mb-[var(--za-space-4)] grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-[var(--za-space-3)]">
          <div className={statCard}>
            <div className={`${statValue} flex items-center justify-center gap-1.5`}>
              <Tv size={16} /> {totalEpisodes}
            </div>
            <div className={statLabel}>Episodes Watched</div>
          </div>
          <div className={statCard}>
            <div className={`${statValue} flex items-center justify-center gap-1.5`}>
              <BookOpen size={16} /> {totalChapters}
            </div>
            <div className={statLabel}>Chapters / Pages</div>
          </div>
          <div className={statCard}>
            <div className={`${statValue} flex items-center justify-center gap-1.5 text-[#b45309]`}>
              <Star size={16} fill="currentColor" /> {avgRating}
            </div>
            <div className={statLabel}>Avg Rating ({ratedEntries.length} rated)</div>
          </div>
        </div>

        {topRated.length > 0 && (
          <div className="mt-[var(--za-space-4)] border-t border-decorative pt-[var(--za-space-3)]">
            <div className={sectionTitle}>Top Rated Entries</div>
            <div className="flex flex-col gap-[0.4rem]">
              {topRated.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-small border border-decorative bg-surface-subtle px-[0.65rem] py-[0.4rem]"
                >
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)]">
                    {item.title}
                  </span>
                  <RatingBadge rating={item.rating ?? 0} />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-[var(--za-space-5)] flex justify-end">
          <button type="button" className="za-button za-button--secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
