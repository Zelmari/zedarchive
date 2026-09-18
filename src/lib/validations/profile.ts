import { z } from 'zod';
import {
  MAX_NAME_LENGTH,
  MAX_BIO_LENGTH,
  MAX_COVER_IMAGE_LENGTH,
  VALID_THEMES,
} from '@/lib/constants';
import { isReservedHandle, isValidHandle, normalizeHandle } from '@/lib/handles';
import { getContrastRatio } from '@/lib/color';
import type { CustomThemePalette } from '@/types/user';

export const updateProfileSchema = z.object({
  name: z
    .string()
    .transform((val) => val.trim())
    .refine((val) => val.length > 0, 'Display name cannot be empty')
    .transform((val) => val.slice(0, MAX_NAME_LENGTH))
    .optional(),
  username: z
    .string()
    .trim()
    .nullable()
    .optional()
    .superRefine((val, ctx) => {
      if (!val) return;
      const normalized = normalizeHandle(val);
      if (normalized !== val.toLowerCase() || !isValidHandle(normalized)) {
        ctx.addIssue({
          code: 'custom',
          message:
            'Handle must be 3–30 characters using only letters, numbers, hyphens, and underscores',
        });
        return;
      }
      if (isReservedHandle(normalized)) {
        ctx.addIssue({
          code: 'custom',
          message: 'This handle is reserved by the system. Please choose another username.',
        });
      }
    }),
  bio: z
    .string()
    .transform((val) => val.trim().slice(0, MAX_BIO_LENGTH))
    .nullable()
    .optional(),
  isPublic: z.boolean().optional(),
  image: z
    .string()
    .refine(
      (val) =>
        !val ||
        (val.length <= MAX_COVER_IMAGE_LENGTH &&
          (/^data:image\//i.test(val) || /^https:\/\//i.test(val))),
      'Invalid avatar. Use a compressed image data URL or an HTTPS image URL.',
    )
    .nullable()
    .optional(),
  countryCode: z
    .string()
    .trim()
    .length(2, 'Country code must be a 2-letter ISO code')
    .toUpperCase()
    .optional(),
});

export const updateThemeSchema = z.object({
  theme: z.enum(VALID_THEMES),
});

const hexColor = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'Invalid hex color');

export const customThemePaletteSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    canvas: hexColor,
    surface: hexColor,
    surfaceSubtle: hexColor,
    text: hexColor,
    textMuted: hexColor,
    borderRequired: hexColor,
    borderDecorative: hexColor,
    accent: hexColor,
    onAccent: hexColor,
  })
  .superRefine((palette, ctx) => {
    const pairs: Array<[string, string, string]> = [
      [palette.text, palette.canvas, 'Text must contrast with the canvas'],
      [palette.text, palette.surface, 'Text must contrast with the surface'],
      [palette.accent, palette.onAccent, 'Accent text must contrast with the accent color'],
    ];
    for (const [fg, bg, message] of pairs) {
      const ratio = getContrastRatio(fg, bg);
      if (!Number.isFinite(ratio) || ratio < 4.5) {
        ctx.addIssue({ code: 'custom', message });
      }
    }
  });

export function parseCustomThemePalette(palette: unknown): CustomThemePalette {
  return customThemePaletteSchema.parse(palette);
}
