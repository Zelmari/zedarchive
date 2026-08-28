import { Shield } from 'lucide-react';
import type { UserProfile } from '@/types/user';

interface SecuritySectionProps {
  profile: UserProfile;
}

export default function SecuritySection({ profile }: SecuritySectionProps) {
  return (
    <section className="za-card za-card--raised rounded-control border border-required bg-surface p-6 shadow-raised">
      <div className="mb-4 flex items-center gap-2 border-b border-decorative pb-3">
        <Shield size={18} className="text-ink-muted" />
        <h2 className="text-sm font-[var(--za-weight-heading)] uppercase tracking-[0.05em] text-ink">
          Authentication & Sign-in
        </h2>
      </div>

      <div className="space-y-3 text-xs">
        <div className="flex items-center justify-between border-b border-decorative pb-2">
          <span className="text-ink-muted">Account Email</span>
          <span className="font-[var(--za-weight-emphasis)] text-ink">{profile.email}</span>
        </div>
        <div className="flex items-center justify-between border-b border-decorative pb-2">
          <span className="text-ink-muted">Email Verification</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-[var(--za-weight-emphasis)] ${
              profile.emailVerified
                ? 'bg-green-100 text-green-800'
                : 'bg-yellow-100 text-yellow-800'
            }`}
          >
            {profile.emailVerified ? 'Verified' : 'Unverified'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-ink-muted">Sign-in Method</span>
          <span className="font-[var(--za-weight-emphasis)] text-ink">Email & Password</span>
        </div>
      </div>
    </section>
  );
}
