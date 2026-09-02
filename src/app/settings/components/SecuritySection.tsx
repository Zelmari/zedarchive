import { Shield } from 'lucide-react';
import type { UserProfile } from '@/types/user';

interface SecuritySectionProps {
  profile: UserProfile;
}

export default function SecuritySection({ profile }: SecuritySectionProps) {
  return (
    <section className="za-bookplate relative p-6 sm:p-8">
      <span className="za-ribbon-bookmark" aria-hidden="true" />
      <div className="mb-5 flex items-center gap-2 border-b border-decorative pb-3">
        <Shield size={18} className="text-accent" />
        <h2 className="font-[var(--za-font-display)] text-sm font-[var(--za-weight-heading)] uppercase tracking-[0.06em] text-ink">
          Authentication & Sign-in
        </h2>
      </div>

      <div className="space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-decorative pb-2">
          <span className="text-ink-muted">Account Email</span>
          <span className="font-[var(--za-weight-emphasis)] text-ink">{profile.email}</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-decorative pb-2">
          <span className="text-ink-muted">Email Verification</span>
          <span
            className={`inline-flex rounded-small border border-current px-2 py-0.5 text-[10px] font-[var(--za-weight-emphasis)] ${
              profile.emailVerified
                ? 'bg-success-surface text-success'
                : 'bg-warning-surface text-warning'
            }`}
          >
            {profile.emailVerified ? 'Verified' : 'Unverified'}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <span className="text-ink-muted">Sign-in Method</span>
          <span className="font-[var(--za-weight-emphasis)] text-ink">Email & Password</span>
        </div>
      </div>
    </section>
  );
}
