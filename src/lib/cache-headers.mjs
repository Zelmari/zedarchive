// Pages and other routes revalidate. /api/covers is excluded so the cover
// route keeps its own Cache-Control. A public header here would mark
// private cover bytes as cacheable.
export const HTML_CACHE_CONTROL_SOURCE = '/((?!api/covers).*)';
export const HTML_CACHE_CONTROL_VALUE = 'no-cache, must-revalidate';
