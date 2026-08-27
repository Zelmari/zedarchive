import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ZedArchive',
    short_name: 'ZedArchive',
    description: 'Personal media, book, anime, and reading archive.',
    start_url: '/',
    display: 'standalone',
    background_color: '#fcfbf9',
    theme_color: '#fcfbf9',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
