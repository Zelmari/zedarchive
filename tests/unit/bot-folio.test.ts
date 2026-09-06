import { describe, it, expect } from 'vitest';
import { ComponentType, MessageFlags } from 'discord.js';
import { buildTitleCard } from '../../bot/src/commands/title';
import { buildEditInspector } from '../../bot/src/commands/edit';
import { buildDraftInspector } from '../../bot/src/commands/add';
import { createDraft } from '../../bot/src/drafts';
import {
  FOLIO_RIBBON_COLOR,
  buildListFolio,
  buildTitleFolio,
  formatFolioBody,
  formatLibraryLine,
  type FolioEntry,
} from '../../bot/src/format/folio';
import { folioEditReplyOptions } from '../../bot/src/format/reply-cover';
import type { MediaRow } from '@/domain/media';

function sampleEntry(overrides: Partial<FolioEntry> = {}): FolioEntry {
  return {
    title: "Frieren: Beyond Journey's End",
    category: 'anime',
    status: 'in_progress',
    rating: 10,
    primaryUnitCurrent: 1,
    primaryUnitTotal: 1,
    secondaryUnitCurrent: 14,
    secondaryUnitTotal: 28,
    isPrivate: false,
    notes: null,
    tags: [],
    ...overrides,
  };
}

function asMediaRow(overrides: Partial<MediaRow> & Partial<FolioEntry> = {}): MediaRow {
  return {
    id: 'title-1',
    userId: 'user-1',
    coverImage: null,
    ...sampleEntry(),
    ...overrides,
  } as MediaRow;
}

function collectText(node: unknown, out: string[] = []): string[] {
  if (!node || typeof node !== 'object') return out;
  const record = node as Record<string, unknown>;
  if (typeof record.content === 'string') out.push(record.content);
  if (Array.isArray(record.components)) {
    for (const child of record.components) collectText(child, out);
  }
  return out;
}

function findByType(node: unknown, type: number): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const walk = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (record.type === type) found.push(record);
    if (Array.isArray(record.components)) {
      for (const child of record.components) walk(child);
    }
    if (record.accessory && typeof record.accessory === 'object') walk(record.accessory);
  };
  walk(node);
  return found;
}

describe('folio builders', () => {
  it('sets the V2 flag and ribbon accent', () => {
    const folio = buildTitleFolio(sampleEntry(), null, []);
    expect(folio.flags).toBe(MessageFlags.IsComponentsV2);
    expect(folio.components[0]?.toJSON()).toMatchObject({
      type: ComponentType.Container,
      accent_color: FOLIO_RIBBON_COLOR,
    });
  });

  it('uses a section thumbnail for https covers', () => {
    const folio = buildTitleFolio(sampleEntry(), 'https://cdn.example/frieren.webp', []);
    const json = folio.components[0]!.toJSON();
    const thumbs = findByType(json, ComponentType.Thumbnail);
    expect(thumbs).toHaveLength(1);
    expect(thumbs[0]?.media).toMatchObject({ url: 'https://cdn.example/frieren.webp' });
    expect(folio.files).toHaveLength(0);
  });

  it('attaches decoded bytes as cover.webp', () => {
    const dataUri = `data:image/webp;base64,${Buffer.from('524946460000000057454250', 'hex').toString('base64')}`;
    const folio = buildTitleFolio(sampleEntry(), dataUri, []);
    const json = folio.components[0]!.toJSON();
    const thumbs = findByType(json, ComponentType.Thumbnail);
    expect(thumbs[0]?.media).toMatchObject({ url: 'attachment://cover.webp' });
    expect(folio.files).toHaveLength(1);
  });

  it('omits the thumbnail accessory when there is no cover', () => {
    const folio = buildTitleFolio(sampleEntry(), null, []);
    const json = folio.components[0]!.toJSON();
    expect(findByType(json, ComponentType.Section)).toHaveLength(0);
    expect(findByType(json, ComponentType.Thumbnail)).toHaveLength(0);
    expect(collectText(json).join('\n')).toContain('ANIME');
    expect(collectText(json).join('\n')).toContain("**Frieren: Beyond Journey's End**");
  });

  it('marks private titles and truncates notes', () => {
    const notes = 'x'.repeat(400);
    const body = formatFolioBody(
      sampleEntry({
        isPrivate: true,
        notes,
      }),
    );
    expect(body).toContain('`PRIVATE`');
    const folio = buildTitleFolio(sampleEntry({ isPrivate: true, notes }), null, []);
    const text = collectText(folio.components[0]!.toJSON()).join('\n');
    expect(text).toContain('`PRIVATE`');
    expect(text).toContain('…');
    expect(text).not.toContain('x'.repeat(400));
  });

  it('keeps title action custom ids', () => {
    const folio = buildTitleCard(asMediaRow());
    const json = folio.components[0]!.toJSON();
    const buttons = findByType(json, ComponentType.Button);
    const ids = buttons.map((b) => b.custom_id);
    expect(ids).toEqual([
      'za:title:title-1:step',
      'za:title:title-1:complete',
      'za:title:title-1:edit',
    ]);
  });

  it('keeps edit inspector select custom ids', () => {
    const folio = buildEditInspector(asMediaRow());
    const json = folio.components[0]!.toJSON();
    const selects = findByType(json, ComponentType.StringSelect);
    const ids = selects.map((s) => s.custom_id);
    expect(ids).toEqual(['za:edit:title-1:select_status', 'za:edit:title-1:select_rate']);
  });

  it('includes draft source and save/cancel ids', () => {
    const draft = createDraft({
      userId: 'user-1',
      discordUserId: 'discord-1',
      title: 'Manual Film',
      category: 'movie',
      sourceId: null,
      structure: [],
      primaryUnitCurrent: 0,
      primaryUnitTotal: 1,
      secondaryUnitCurrent: 0,
      secondaryUnitTotal: null,
      status: 'in_progress',
      rating: null,
      coverUrl: null,
      notes: null,
    });
    const folio = buildDraftInspector(draft);
    const text = collectText(folio.components[0]!.toJSON()).join('\n');
    expect(text).toContain('Source: Manual Title');
    expect(text).toContain('FILM');
    const ids = findByType(folio.components[0]!.toJSON(), ComponentType.Button).map(
      (b) => b.custom_id,
    );
    expect(ids).toEqual([
      `za:add:${draft.draftId}:modal_details`,
      `za:add:${draft.draftId}:submit`,
      `za:add:${draft.draftId}:cancel`,
    ]);
  });

  it('renders compact library lines without per-row covers', () => {
    const folio = buildListFolio({
      heading: 'Personal Archive',
      footer: 'Page 1 · 10 per page',
      lines: [
        formatLibraryLine(
          {
            title: "Frieren: Beyond Journey's End",
            category: 'anime',
            status: 'in_progress',
            rating: 10,
            primaryUnitCurrent: 1,
            secondaryUnitCurrent: 14,
            secondaryUnitTotal: 28,
          },
          { index: 1 },
        ),
      ],
    });
    const json = folio.components[0]!.toJSON();
    expect(findByType(json, ComponentType.Thumbnail)).toHaveLength(0);
    const text = collectText(json).join('\n');
    expect(text).toContain('Personal Archive');
    expect(text).toContain('ANIME');
    expect(text).toContain('S1E14 / 28');
    expect(text).toContain('★10');
  });

  it('folioEditReplyOptions always sends the V2 flag and clears attachments', () => {
    const options = folioEditReplyOptions(buildTitleFolio(sampleEntry(), null, []));
    expect(options.flags).toBe(MessageFlags.IsComponentsV2);
    expect(options.attachments).toEqual([]);
    expect(options.embeds).toEqual([]);
    expect(options.content).toBeNull();
  });
});
