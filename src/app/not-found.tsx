import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4 text-ink">
      <div className="za-card za-card--raised max-w-md p-8 text-center">
        <h1 className="mb-2 text-3xl font-bold text-ink">404</h1>
        <h2 className="mb-4 text-lg text-ink">Page Not Found</h2>
        <p className="mb-6 text-sm text-ink-muted">
          The page or archive entry you are looking for does not exist or has been moved.
        </p>
        <Link href="/" className="za-button za-button--primary">
          Return to ZedArchive
        </Link>
      </div>
    </div>
  );
}
