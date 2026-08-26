export type MediaCategory = 'show' | 'book' | 'anime' | 'manga';
export type MediaStatus = 'in_progress' | 'completed' | 'planning' | 'on_hold' | 'dropped';

export interface StructureItem {
  number: number;
  name: string;
  total: number | null;
}

/**
 * Serialized media entry as exchanged between server actions and the client
 * (dates as ISO strings, JSON-friendly throughout).
 */
export interface MediaEntry {
  id: string;
  userId: string;
  title: string;
  category: MediaCategory;
  primaryUnitCurrent: number;
  primaryUnitTotal: number | null;
  secondaryUnitCurrent: number;
  secondaryUnitTotal: number | null;
  structure: StructureItem[];
  status: MediaStatus;
  completedAt: string | null;
  startedAt: string | null;
  rewatchCount: number;
  rating: number | null;
  tags: string[];
  genres: string[];
  synopsis: string | null;
  coverImage: string | null;
  sourceId: string | null;
  notes: string | null;
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
