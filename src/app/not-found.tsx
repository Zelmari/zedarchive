import Link from 'next/link';
import { ArrowLeft, BookOpen } from 'lucide-react';

export default function NotFound() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-screen items-center justify-center bg-canvas p-4 text-ink"
    >
      <section
        aria-labelledby="not-found-title"
        className="za-bookplate relative w-full max-w-md p-8 text-center"
      >
        <span className="za-ribbon-bookmark" aria-hidden="true" />
        <BookOpen
          aria-hidden="true"
          className="mx-auto mb-4 text-accent"
          size={36}
          strokeWidth={1.5}
        />
        <p className="mb-2 font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] uppercase tracking-[0.16em] text-accent">
          Catalogue notice · 404
        </p>
        <h1
          id="not-found-title"
          className="mb-3 font-[var(--za-font-display)] text-[length:var(--za-text-heading-lg)] font-[var(--za-weight-heading)] uppercase tracking-[0.04em] text-ink"
        >
          Catalogue entry missing
        </h1>
        <p className="mb-6 font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] leading-[var(--za-leading-body)] text-ink-muted">
          The page or archive entry you requested has not been entered in this catalogue, or has
          been moved.
        </p>
        <Link href="/" className="za-button za-button--primary">
          <ArrowLeft size={16} strokeWidth={2} />
          Return to zedarchive
        </Link>
      </section>
    </main>
  );
}
