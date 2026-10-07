export type ClerkCategory = 'show' | 'movie' | 'book' | 'anime' | 'manga';
export type ClerkStatus = 'in_progress' | 'completed' | 'planning' | 'on_hold' | 'dropped';
export type SecondaryUnit = 'chapter' | 'page';
export type SpokenSecondary = SecondaryUnit | 'episode';

/** Compact row. This is the shape the model is allowed to see. */
export interface ClerkCatalogRow {
  id: string;
  title: string;
  category: ClerkCategory;
  status: ClerkStatus;
  primaryUnitCurrent: number;
  primaryUnitTotal: number | null;
  secondaryUnitCurrent: number;
  secondaryUnitTotal: number | null;
  secondaryUnitKind: SecondaryUnit | null;
  rating: number | null;
  queued: boolean;
}

/** Provider hit attached by the server. The model cannot fill this in. */
export interface CatalogHit {
  sourceId: string;
  title: string;
  category: ClerkCategory;
  coverUrl: string | null;
  primaryUnitTotal: number | null;
  secondaryUnitTotal: number | null;
  authors: string | null;
  year: string | null;
}

export type ClerkAction =
  | {
      type: 'increment_secondary';
      entryId: string;
      amount: number;
      unit: SpokenSecondary | null;
    }
  | { type: 'increment_primary'; entryId: string; amount: number }
  | {
      type: 'set_progress';
      entryId: string;
      primary: number | null;
      secondary: number | null;
      unit: SpokenSecondary | null;
    }
  | {
      type: 'set_status';
      entryId: string;
      status: ClerkStatus;
      dropReason: string | null;
    }
  | { type: 'set_rating'; entryId: string; rating: number }
  | { type: 'append_note'; entryId: string; text: string }
  | {
      type: 'add_quote';
      entryId: string;
      text: string;
      speaker: string | null;
      citation: string | null;
    }
  | { type: 'add_tags'; entryId: string; tags: string[] }
  | { type: 'remove_tags'; entryId: string; tags: string[] }
  | { type: 'set_queued'; entryId: string; queued: boolean }
  | {
      type: 'create_from_catalog';
      category: ClerkCategory;
      query: string;
      author: string | null;
      year: number | null;
      hit: CatalogHit | null;
    }
  | { type: 'set_unit'; entryId: string; unit: SecondaryUnit };

export interface ClerkPlan {
  actions: ClerkAction[];
}
