import type { mediaEntries } from '@/db/schema';

export type MediaCategory = 'show' | 'book' | 'anime' | 'manga';
export type MediaStatus = 'in_progress' | 'completed' | 'planning' | 'on_hold' | 'dropped';

export interface StructureItem {
  number: number;
  name: string;
  total: number | null;
}

type MediaRow = typeof mediaEntries.$inferSelect;

/**
 * Serialized media entry as exchanged between server actions and the client
 * (dates as ISO strings, JSON-friendly throughout).
 */
export interface MediaEntry extends Omit<
  MediaRow,
  | 'completedAt'
  | 'startedAt'
  | 'createdAt'
  | 'updatedAt'
  | 'category'
  | 'status'
  | 'structure'
  | 'tags'
  | 'genres'
> {
  category: MediaCategory;
  status: MediaStatus;
  structure: StructureItem[];
  tags: string[];
  genres: string[];
  completedAt: string | null;
  startedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreateMediaInput = Omit<MediaEntry, 'id' | 'userId' | 'createdAt' | 'updatedAt'>;
export type UpdateMediaInput = Partial<CreateMediaInput>;

export interface NextAirInfo {
  season: number;
  number: number;
  airdate: string;
  airstamp?: string | null;
  status: string;
}

export type NextAirMap = Record<string, NextAirInfo | null>;
