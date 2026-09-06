import {
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  type ActionRowBuilder,
  type AttachmentBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import { ZED_ACCENT_COLOR, truncateText } from './embeds';
import { folioCoverMedia } from './folio-cover';
import { formatCategoryRibbon, formatShelf, formatShelfBadge } from './labels';
import {
  formatProgressBar,
  formatProgressString,
  progressFraction,
  type ProgressFormatInput,
} from './progress';

/** Web bookplate ribbon. Used on media title / list plates. */
export const FOLIO_RIBBON_COLOR = 0x8c2d19;

export type FolioActionRow = ActionRowBuilder<MessageActionRowComponentBuilder>;

export type FolioMessage = {
  flags: typeof MessageFlags.IsComponentsV2;
  components: ContainerBuilder[];
  files: AttachmentBuilder[];
};

export type FolioEntry = ProgressFormatInput & {
  title: string;
  rating?: number | null;
  isPrivate?: boolean | null;
  notes?: string | null;
  tags?: unknown;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
};

export type ListFolioEntry = ProgressFormatInput & {
  title: string;
  status: string;
  rating?: number | null;
};

function assembleFolio(container: ContainerBuilder, files: AttachmentBuilder[]): FolioMessage {
  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container],
    files,
  };
}

function formatDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString();
}

export function formatFolioBody(entry: FolioEntry): string {
  const meta: string[] = [`\`${formatShelfBadge(entry.status ?? '')}\``];
  if (entry.rating) meta.push(`★ ${entry.rating}/10`);
  if (entry.isPrivate) meta.push('`PRIVATE`');

  const progress = formatProgressString(entry);
  const fraction = progressFraction(entry);
  const bar = fraction == null ? '' : ` ${formatProgressBar(fraction)}`;

  const lines = [
    formatCategoryRibbon(entry.category),
    `**${entry.title}**`,
    meta.join(' · '),
    `\`${progress}\`${bar}`,
  ];

  const dates: string[] = [];
  if (entry.startedAt) {
    const started = formatDate(entry.startedAt);
    if (started) dates.push(`Started ${started}`);
  }
  if (entry.completedAt) {
    const completed = formatDate(entry.completedAt);
    if (completed) dates.push(`Completed ${completed}`);
  }
  if (dates.length > 0) lines.push(dates.join(' · '));

  if (Array.isArray(entry.tags) && entry.tags.length > 0) {
    const tags = (entry.tags as unknown[])
      .map((t) => String(t).trim())
      .filter(Boolean)
      .map((t) => `\`#${t}\``)
      .join(' ');
    if (tags) lines.push(tags);
  }

  return lines.join('\n');
}

function addEntryCopyToSection(section: SectionBuilder, entry: FolioEntry, notesMax: number): void {
  section.addTextDisplayComponents(new TextDisplayBuilder().setContent(formatFolioBody(entry)));
  const notes = truncateText(entry.notes, notesMax);
  if (notes) {
    section.addTextDisplayComponents(new TextDisplayBuilder().setContent(`*${notes}*`));
  }
}

function addEntryCopyToContainer(
  container: ContainerBuilder,
  entry: FolioEntry,
  notesMax: number,
): void {
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(formatFolioBody(entry)));
  const notes = truncateText(entry.notes, notesMax);
  if (notes) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`*${notes}*`));
  }
}

function buildCoverSection(entry: FolioEntry, coverUrl: string, notesMax: number): SectionBuilder {
  const section = new SectionBuilder().setThumbnailAccessory(
    new ThumbnailBuilder().setURL(coverUrl).setDescription(entry.title.slice(0, 1024)),
  );
  addEntryCopyToSection(section, entry, notesMax);
  return section;
}

function mediaContainer(options: {
  entry: FolioEntry;
  coverUrl: string | null;
  notesMax: number;
  instruction?: string;
  extraLines?: string[];
  accent?: number;
  actions: FolioActionRow[];
}): ContainerBuilder {
  const container = new ContainerBuilder().setAccentColor(options.accent ?? FOLIO_RIBBON_COLOR);

  if (options.instruction) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(options.instruction));
  }
  if (options.extraLines && options.extraLines.length > 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(options.extraLines.join('\n')),
    );
  }

  if (options.coverUrl) {
    container.addSectionComponents(
      buildCoverSection(options.entry, options.coverUrl, options.notesMax),
    );
  } else {
    addEntryCopyToContainer(container, options.entry, options.notesMax);
  }

  if (options.actions.length > 0) {
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    container.addActionRowComponents(...options.actions);
  }

  return container;
}

export function buildTitleFolio(
  entry: FolioEntry,
  coverSource: string | null | undefined,
  actions: FolioActionRow[],
): FolioMessage {
  const cover = folioCoverMedia(coverSource);
  const container = mediaContainer({
    entry,
    coverUrl: cover.thumbnailUrl,
    notesMax: 300,
    actions,
  });
  return assembleFolio(container, cover.files);
}

export function buildEditFolio(
  entry: FolioEntry,
  coverSource: string | null | undefined,
  actions: FolioActionRow[],
): FolioMessage {
  const cover = folioCoverMedia(coverSource);
  const container = mediaContainer({
    entry,
    coverUrl: cover.thumbnailUrl,
    notesMax: 200,
    instruction: 'Shelf, rating, and notes below.',
    actions,
  });
  return assembleFolio(container, cover.files);
}

export function buildDraftFolio(
  entry: FolioEntry,
  coverSource: string | null | undefined,
  actions: FolioActionRow[],
  extras?: { sourceLine?: string },
): FolioMessage {
  const cover = folioCoverMedia(coverSource);
  const extraLines = extras?.sourceLine ? [extras.sourceLine] : undefined;
  const container = mediaContainer({
    entry,
    coverUrl: cover.thumbnailUrl,
    notesMax: 200,
    instruction: 'Review your draft before saving.',
    extraLines,
    actions,
  });
  return assembleFolio(container, cover.files);
}

export function formatLibraryLine(
  entry: ListFolioEntry,
  options?: { includeShelf?: boolean; index?: number },
): string {
  const ratingPart = entry.rating ? ` · ★${entry.rating}` : '';
  const shelfPart = options?.includeShelf ? ` · ${formatShelf(entry.status)}` : '';
  const prefix = options?.index != null ? `${options.index}. ` : '';
  return `${prefix}**${entry.title}** · ${formatCategoryRibbon(entry.category)} · \`${formatProgressString(entry)}\`${ratingPart}${shelfPart}`;
}

export function buildListFolio(options: {
  heading: string;
  footer?: string;
  lines: string[];
  actions?: FolioActionRow[];
  accent?: number;
}): FolioMessage {
  const container = new ContainerBuilder().setAccentColor(options.accent ?? FOLIO_RIBBON_COLOR);
  const header = options.footer ? `${options.heading}\n-# ${options.footer}` : options.heading;
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(header));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(options.lines.join('\n')));
  if (options.actions && options.actions.length > 0) {
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    container.addActionRowComponents(...options.actions);
  }
  return assembleFolio(container, []);
}

export function buildChromeFolio(options: {
  heading: string;
  body: string;
  accent?: number;
}): FolioMessage {
  const container = new ContainerBuilder().setAccentColor(options.accent ?? ZED_ACCENT_COLOR);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`**${options.heading}**\n${options.body}`),
  );
  return assembleFolio(container, []);
}
