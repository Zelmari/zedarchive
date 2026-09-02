import { z } from 'zod';
import { MAX_COVER_IMAGE_LENGTH } from '@/lib/constants';

export const createGroupSchema = z.object({
  name: z.string().trim().min(1, 'Group name is required').max(100),
  description: z.string().trim().max(500).optional(),
  image: z
    .string()
    .max(MAX_COVER_IMAGE_LENGTH)
    .optional()
    .nullable()
    .refine(
      (val) => !val || /^https:\/\//i.test(val) || /^data:image\//i.test(val),
      'Image must be https:// or data:image/',
    ),
  memberUserIds: z.array(z.string()).default([]),
});

export const updateGroupSchema = z.object({
  groupId: z.string().min(1, 'Group ID is required'),
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  image: z
    .string()
    .max(MAX_COVER_IMAGE_LENGTH)
    .optional()
    .nullable()
    .refine(
      (val) => !val || /^https:\/\//i.test(val) || /^data:image\//i.test(val),
      'Image must be https:// or data:image/',
    ),
});

export const sendGroupMessageSchema = z.object({
  groupId: z.string().min(1, 'Group ID is required'),
  body: z.string().trim().min(1, 'Message cannot be empty').max(2000),
});

export const transferGroupOwnershipSchema = z.object({
  groupId: z.string().min(1),
  newOwnerUserId: z.string().min(1),
});
