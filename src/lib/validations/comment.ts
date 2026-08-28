import { z } from 'zod';
import { MAX_COMMENT_LENGTH } from '@/lib/constants';

export const createCommentSchema = z.object({
  profileUserId: z.string().min(1, 'Profile user ID is required'),
  body: z.string().trim().min(1, 'Comment cannot be empty').max(MAX_COMMENT_LENGTH),
});
