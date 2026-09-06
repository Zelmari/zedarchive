export const ZED_ACCENT_COLOR = 0xb08d57;

/**
 * Strips HTML / complex markdown and truncates text for embeds and folio copy.
 */
export function truncateText(text?: string | null, maxLength = 300): string {
  if (!text) return '';
  const clean = text.replace(/<[^>]*>/g, '').trim();
  if (clean.length <= maxLength) return clean;
  return clean.slice(0, maxLength - 1) + '…';
}
