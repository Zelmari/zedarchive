import './globals.css';
import { getSessionTheme } from '@/server/queries/user';

export const metadata = {
  title: {
    default: 'zedarchive — Quiet Media Archive',
    template: '%s — zedarchive',
  },
  description: 'A fast, distraction-free archive for your anime, TV series, novels, and books.',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
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

const SW_REGISTER_SCRIPT =
  "if('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost')){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});}";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = await getSessionTheme();

  return (
    <html lang="en" data-theme={theme}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: SW_REGISTER_SCRIPT }} />
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
