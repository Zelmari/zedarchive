import type { MetadataRoute } from 'next';

/**
 * Link-preview crawlers (X Twitterbot, iMessage/Facebook) must be allowed
 * even when Cloudflare injects AI-crawler blocks into robots.txt.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
      },
      {
        userAgent: 'Twitterbot',
        allow: '/',
      },
      {
        userAgent: 'facebookexternalhit',
        allow: '/',
      },
      {
        userAgent: 'Applebot',
        allow: '/',
      },
    ],
  };
}
