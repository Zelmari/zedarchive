export type ActivityActionType =
  'progress_update' | 'status_change' | 'created' | 'completed' | 'rating' | 'rewatch';

export interface ActivityLog {
  id: string;
  userId: string;
  mediaId: string;
  actionType: ActivityActionType | string;
  details: Record<string, unknown>;
  createdAt: string;
}
