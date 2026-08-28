import { z } from 'zod';
import {
  MAX_NAME_LENGTH,
  MAX_BIO_LENGTH,
  MAX_USERNAME_LENGTH,
  MAX_COVER_IMAGE_LENGTH,
  VALID_THEMES,
} from '@/lib/constants';
import { isReservedHandle } from '@/lib/handles';

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
    .max(MAX_USERNAME_LENGTH)
    .refine(
      (val) => !val || !isReservedHandle(val),
      'This handle is reserved by the system. Please choose another username.',
    )
    .nullable()
    .optional(),
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
});

export const updateThemeSchema = z.object({
  theme: z.enum(VALID_THEMES),
});
