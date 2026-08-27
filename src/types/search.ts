import type { StructureItem } from './media';

export interface SearchResult {
  sourceId: string;
  category: string;
  title: string;
  coverUrl: string | null;
  primaryUnitTotal: number;
  structure: StructureItem[];
  secondaryUnitTotal: number | null;
  authors?: string | null;
  year: string | null;
}
