'use client';

import { useState } from 'react';
import { UNIT_FIELDS, unitFieldLabel, type UnitFieldName } from '@/lib/media-unit-fields';
import { seasonTotal } from '@/lib/season';
import type { MediaCategory, StructureItem } from '@/types/media';

interface FolioUnitTotalsProps {
  category: MediaCategory;
  primaryUnitTotal: number | null;
  primaryUnitCurrent: number;
  secondaryUnitTotal: number | null;
  secondaryUnitCurrent: number;
  structure: StructureItem[];
  activeSeason: number;
  isUpdating: boolean;
  onCommit: (payload: Record<string, unknown>) => Promise<void>;
}

function getFieldDisplayValue(
  field: UnitFieldName,
  category: MediaCategory,
  primaryUnitTotal: number | null,
  primaryUnitCurrent: number,
  secondaryUnitTotal: number | null,
  secondaryUnitCurrent: number,
  structure: StructureItem[],
  activeSeason: number,
): string {
  switch (field) {
    case 'primaryUnitTotal':
      return primaryUnitTotal != null ? String(primaryUnitTotal) : '';
    case 'primaryUnitCurrent':
      return primaryUnitCurrent != null
        ? String(primaryUnitCurrent)
        : category === 'movie'
          ? '0'
          : '1';
    case 'secondaryUnitTotal': {
      if (structure.length > 0) {
        const sTotal = seasonTotal(structure, activeSeason);
        if (sTotal != null) return String(sTotal);
        if (activeSeason === primaryUnitCurrent && secondaryUnitTotal != null) {
          return String(secondaryUnitTotal);
        }
        return '';
      }
      return secondaryUnitTotal != null ? String(secondaryUnitTotal) : '';
    }
    case 'secondaryUnitCurrent':
      return secondaryUnitCurrent != null ? String(secondaryUnitCurrent) : '0';
  }
}

export default function FolioUnitTotals({
  category,
  primaryUnitTotal,
  primaryUnitCurrent,
  secondaryUnitTotal,
  secondaryUnitCurrent,
  structure,
  activeSeason,
  isUpdating,
  onCommit,
}: FolioUnitTotalsProps) {
  const [activeField, setActiveField] = useState<UnitFieldName | null>(null);
  const [activeValue, setActiveValue] = useState<string>('');

  const getEffectiveValue = (field: UnitFieldName): string => {
    if (activeField === field) {
      return activeValue;
    }
    return getFieldDisplayValue(
      field,
      category,
      primaryUnitTotal,
      primaryUnitCurrent,
      secondaryUnitTotal,
      secondaryUnitCurrent,
      structure,
      activeSeason,
    );
  };

  const handleCommit = async (field: UnitFieldName, committedValue: string) => {
    setActiveField(null);
    setActiveValue('');

    const getValueFor = (f: UnitFieldName) => (f === field ? committedValue : getEffectiveValue(f));

    const rawPriCur = getValueFor('primaryUnitCurrent').trim();
    const rawPriTot = getValueFor('primaryUnitTotal').trim();
    const rawSecCur = getValueFor('secondaryUnitCurrent').trim();
    const rawSecTot = getValueFor('secondaryUnitTotal').trim();

    const parsedPriCur = parseInt(rawPriCur, 10);
    const parsedPriTot = rawPriTot ? parseInt(rawPriTot, 10) : null;
    const parsedSecCur = parseInt(rawSecCur, 10);
    const parsedSecTot = rawSecTot ? parseInt(rawSecTot, 10) : null;

    const nextPriCur = isNaN(parsedPriCur)
      ? category === 'movie'
        ? 0
        : 1
      : Math.max(category === 'movie' ? 0 : 1, parsedPriCur);

    const nextPriTot =
      parsedPriTot === null || isNaN(parsedPriTot) ? null : Math.max(1, parsedPriTot);

    const nextSecCur = isNaN(parsedSecCur) ? 0 : Math.max(0, parsedSecCur);

    const nextSecTot =
      parsedSecTot === null || isNaN(parsedSecTot) ? null : Math.max(0, parsedSecTot);

    const payload: Record<string, unknown> = {
      primaryUnitTotal: nextPriTot,
      primaryUnitCurrent: nextPriCur,
      secondaryUnitTotal: nextSecTot,
      secondaryUnitCurrent: nextSecCur,
    };

    if (structure.length > 0 && field === 'secondaryUnitTotal') {
      const targetSeason = activeSeason || nextPriCur;
      payload.structure = structure.map((s) =>
        s.number === targetSeason ? { ...s, total: nextSecTot } : s,
      );
      if (targetSeason !== nextPriCur) {
        payload.secondaryUnitTotal = seasonTotal(structure, nextPriCur) ?? secondaryUnitTotal;
      }
    }

    if (
      structure.length > 0 &&
      field === 'primaryUnitCurrent' &&
      nextPriCur !== primaryUnitCurrent
    ) {
      const seasonTot = seasonTotal(structure, nextPriCur);
      payload.secondaryUnitTotal = seasonTot;
    }

    await onCommit(payload);
  };

  const fields = UNIT_FIELDS[category] || [];

  return (
    <div className="mb-4 grid grid-cols-2 gap-3">
      {fields.map((unitField) => {
        const label = unitFieldLabel(unitField, {
          primaryUnitCurrent: structure.length > 0 ? activeSeason : primaryUnitCurrent,
        });
        const inputId = `folio-unit-${unitField.field}`;
        const val = getEffectiveValue(unitField.field);

        return (
          <div key={unitField.field}>
            <label
              htmlFor={inputId}
              className="mb-1 block text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-ink-muted"
            >
              {label}
            </label>
            <input
              id={inputId}
              type="number"
              min={unitField.min}
              placeholder={unitField.placeholder}
              className="za-field text-xs"
              value={val}
              disabled={isUpdating}
              onFocus={() => {
                setActiveField(unitField.field);
                setActiveValue(val);
              }}
              onChange={(e) => {
                setActiveValue(e.target.value);
              }}
              onBlur={() => {
                if (activeField === unitField.field) {
                  void handleCommit(unitField.field, activeValue);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
