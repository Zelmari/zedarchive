import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ZedArchive',
    short_name: 'ZedArchive',
    description: 'Personal media, book, anime, and reading archive.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#fcfbf9',
    theme_color: '#fcfbf9',
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
    ],
  };
}
