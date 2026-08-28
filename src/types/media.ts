import type { mediaEntries } from '@/db/schema';

export type MediaCategory = 'show' | 'movie' | 'book' | 'anime' | 'manga';
export type MediaStatus = 'in_progress' | 'completed' | 'planning' | 'on_hold' | 'dropped';

export interface StructureItem {
  number: number;
  name: string;
  total: number | null;
}

export interface MediaCycle {
  id: string; // UUID for deterministic updates/deletes
  cycleNumber: number; // 1 = Original run, 2 = 1st rewatch, etc.
  startedAt: string | null; // ISO 8601 string
  completedAt: string | null; // ISO 8601 string
  rating?: number | null; // Optional cycle-specific rating (1-10)
  notes?: string | null; // Optional notes specific to this rewatch
}

export interface MediaCycleInput {
  startedAt?: string | null;
  completedAt?: string | null;
  rating?: number | null;
  notes?: string | null;
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
  | 'droppedAt'
  | 'createdAt'
  | 'updatedAt'
  | 'category'
  | 'status'
  | 'structure'
  | 'tags'
  | 'genres'
  | 'cycles'
> {
  category: MediaCategory;
  status: MediaStatus;
  structure: StructureItem[];
  tags: string[];
  genres: string[];
  cycles: MediaCycle[];
  completedAt: string | null;
  startedAt: string | null;
  droppedAt: string | null;
  dropReason: string | null;
  droppedProgressPrimary: number | null;
  droppedProgressSecondary: number | null;
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
