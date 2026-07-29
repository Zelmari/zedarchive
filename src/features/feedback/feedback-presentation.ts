export type FeedbackPresentationTone =
  'error' | 'information' | 'success' | 'warning'

export function getFeedbackNoticeClassName(
  tone: FeedbackPresentationTone,
): string {
  return `za-notice za-notice--${tone}`
}

export function isAlertFeedbackTone(tone: FeedbackPresentationTone): boolean {
  return tone === 'error' || tone === 'warning'
}
