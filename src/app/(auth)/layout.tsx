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
      <div className="flex-1">{children}</div>
    </div>
  );
}
