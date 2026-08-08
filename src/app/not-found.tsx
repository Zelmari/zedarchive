import Link from 'next/link'

export default function NotFound() {
  return (
    <main
      className="za-container za-container--narrow za-page za-page--not-found"
      id="main-content"
      tabIndex={-1}
    >
      <section className="za-press-surface za-auth-sheet">
        <p className="za-eyebrow">Misfiled page</p>
        <h1 className="za-display-heading">This page isn’t on the shelf.</h1>
        <p>The address may be wrong, or the page may have moved.</p>
        <Link className="za-link" href="/">
          Return to the anime catalogue
        </Link>
      </section>
    </main>
  )
}
