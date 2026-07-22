export const animeEpisodeProgressFormatValues = [
  'tv',
  'ova',
  'ona',
  'special',
] as const

export function getAnimeEpisodeProgressSupport(
  format: string,
): 'trackable' | 'not_applicable' | 'format_unknown' {
  if (
    animeEpisodeProgressFormatValues.includes(
      format as (typeof animeEpisodeProgressFormatValues)[number],
    )
  )
    return 'trackable'
  return format === 'movie' ? 'not_applicable' : 'format_unknown'
}
