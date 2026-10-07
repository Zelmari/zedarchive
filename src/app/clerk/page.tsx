import { requireSession } from '@/server/internal';
import { getClerkPageState } from '@/server/clerk';
import SubPageHeader from '@/components/navigation/SubPageHeader';
import ClerkClient from './ClerkClient';

export const metadata = {
  title: 'Clerk',
  description: 'Tell your archive what happened.',
};

export default async function ClerkPage() {
  await requireSession();
  const state = await getClerkPageState();

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <SubPageHeader variant="sticky" backLink={{ href: '/dashboard', label: 'Dashboard' }}>
        <h1 className="min-w-0 break-words font-[family-name:var(--za-font-display)] text-base font-[var(--za-weight-heading)] uppercase leading-[var(--za-leading-compact)] tracking-[0.06em] text-ink">
          Clerk
        </h1>
      </SubPageHeader>

      <main id="main-content" className="pb-16 pt-8 sm:pt-10">
        <div className="za-container max-w-[var(--za-content-medium)]">
          <ClerkClient state={state} />
        </div>
      </main>
    </div>
  );
}
