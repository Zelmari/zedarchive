const SHELF_LABELS: Record<string, string> = {
  in_progress: 'In Progress',
  completed: 'Completed',
  planning: 'Planning',
  on_hold: 'On Hold',
  dropped: 'Dropped',
};

const CATEGORY_LABELS: Record<string, string> = {
  show: 'TV Show',
  movie: 'Movie',
  book: 'Book',
  anime: 'Anime',
  manga: 'Manga',
};

function titleCase(value: string): string {
  return value
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function formatShelf(status: string): string {
  return SHELF_LABELS[status] ?? titleCase(status);
}

export function formatCategory(category: string): string {
  return CATEGORY_LABELS[category] ?? titleCase(category);
}

export const TITLE_NOT_FOUND = 'No title in your archive. `/add` it first.';
