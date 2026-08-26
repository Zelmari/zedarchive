import './globals.css';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { user as userTable } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const metadata = {
  title: 'zedarchive — Quiet Media Archive',
  description: 'A fast, distraction-free archive for your anime, TV series, novels, and books.',
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  manifest: '/manifest.webmanifest',
};

// Runs before paint: restores the last known theme from the local cache while
// the server-rendered data-theme attribute remains the authoritative source.
const THEME_BOOTSTRAP_SCRIPT =
  "try{var t=localStorage.getItem('za-theme');if(t){document.documentElement.setAttribute('data-theme',t);}}catch(e){}";

async function getSessionTheme() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return 'parchment';
    }
    const [row] = await db
      .select({ theme: userTable.theme })
      .from(userTable)
      .where(eq(userTable.id, session.user.id));
    return row?.theme || 'parchment';
  } catch {
    return 'parchment';
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = await getSessionTheme();

  return (
    <html lang="en" data-theme={theme}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>
        <a href="#main-content" className="za-skip-link">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
