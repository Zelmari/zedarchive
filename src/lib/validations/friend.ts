import { z } from 'zod';

export const sendFriendRequestSchema = z.object({
  targetUserId: z.string().min(1, 'Target user ID is required'),
});

export const respondFriendRequestSchema = z.object({
  requestId: z.string().min(1, 'Request ID is required'),
  action: z.enum(['accept', 'reject']),
});

export const cancelFriendRequestSchema = z.object({
  requestId: z.string().min(1, 'Request ID is required'),
});

export const removeFriendSchema = z.object({
  friendUserId: z.string().min(1, 'Friend user ID is required'),
});
