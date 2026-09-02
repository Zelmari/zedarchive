import type { MediaCategory } from '@/types/media';

export type UnitFieldName =
  'primaryUnitTotal' | 'primaryUnitCurrent' | 'secondaryUnitTotal' | 'secondaryUnitCurrent';

export interface UnitFieldContext {
  primaryUnitCurrent: string | number;
}

export interface UnitField {
  field: UnitFieldName;
  label: string | ((ctx: UnitFieldContext) => string);
  min: number;
  placeholder?: string;
  fallback?: string;
}

const SHOW_UNIT_FIELDS: UnitField[] = [
  { field: 'primaryUnitTotal', label: 'Total Seasons', min: 1, placeholder: '1' },
  {
    field: 'primaryUnitCurrent',
    label: 'Current Season',
    min: 1,
  },
  {
    field: 'secondaryUnitTotal',
    label: (ctx) => `Episodes in Season ${ctx.primaryUnitCurrent}`,
    min: 1,
    placeholder: 'e.g. 12',
  },
  {
    field: 'secondaryUnitCurrent',
    label: 'Current Episode',
    min: 0,
  },
];

const BOOK_UNIT_FIELDS: UnitField[] = [
  { field: 'primaryUnitTotal', label: 'Total Volumes', min: 1, placeholder: '1' },
  {
    field: 'primaryUnitCurrent',
    label: 'Current Volume',
    min: 1,
  },
  {
    field: 'secondaryUnitTotal',
    label: 'Total Chapters / Pages',
    min: 1,
    placeholder: 'e.g. 350',
  },
  {
    field: 'secondaryUnitCurrent',
    label: 'Current Chapter / Page',
    min: 0,
  },
];

export const UNIT_FIELDS: Record<MediaCategory, UnitField[]> = {
  show: SHOW_UNIT_FIELDS,
  anime: SHOW_UNIT_FIELDS,
  book: BOOK_UNIT_FIELDS,
  manga: BOOK_UNIT_FIELDS,
  movie: [
    {
      field: 'secondaryUnitTotal',
      label: 'Runtime (Minutes)',
      min: 1,
      placeholder: 'e.g. 148',
    },
    {
      field: 'primaryUnitCurrent',
      label: 'Times Watched (Rewatches)',
      min: 0,
      fallback: '0',
    },
  ],
};

/**
 * Resolves the display label for a unit field given the active form or entity context.
 */
export function unitFieldLabel(field: UnitField, ctx: UnitFieldContext): string {
  return typeof field.label === 'function' ? field.label(ctx) : field.label;
}
