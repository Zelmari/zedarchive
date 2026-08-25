import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--za-color-canvas)', padding: '1rem' }}>
      <div className="za-card za-card--raised" style={{ maxWidth: '28rem', textAlign: 'center', padding: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--za-color-text)' }}>404</h1>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--za-color-text)' }}>Page Not Found</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--za-color-text-muted)', marginBottom: '1.5rem' }}>
          The page or archive entry you are looking for does not exist or has been moved.
        </p>
        <Link href="/" className="za-button za-button--primary">
          Return to ZedArchive
        </Link>
      </div>
    </div>
  );
}
