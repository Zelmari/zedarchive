import Link from 'next/link';
import SubPageHeader from '@/components/navigation/SubPageHeader';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <SubPageHeader
        actions={
          <div className="flex items-center gap-3">
            <Link href="/search" className="za-link text-xs">
              Discover
            </Link>
          </div>
        }
      />
      <main
        id="main-content"
        tabIndex={-1}
        className="flex flex-1 items-start justify-center py-[var(--za-space-8)] sm:items-center sm:py-[var(--za-space-12)]"
      >
        <div className="za-container za-container--narrow w-full">{children}</div>
      </main>
    </div>
  );
}
