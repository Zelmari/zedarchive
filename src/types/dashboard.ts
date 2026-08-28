export type DashboardTab = 'total' | 'shows' | 'movies' | 'books';

export type SortKey =
  | 'updated_desc'
  | 'created_desc'
  | 'created_asc'
  | 'title_asc'
  | 'title_desc'
  | 'progress_desc'
  | 'rating_desc'
  | 'priority_asc';
