import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import CatalogueError from '@/app/error'

describe('CatalogueError', () => {
  it('renders the approved error notice and retry control without exposing the failure', () => {
    const markup = renderToStaticMarkup(
      createElement(CatalogueError, {
        error: Object.assign(new Error('private database failure'), {
          digest: 'private-digest',
        }),
        unstable_retry: vi.fn(),
      }),
    )

    expect(markup).toContain('id="main-content"')
    expect(markup).toContain('za-container--wide')
    expect(markup).toContain('za-notice--error')
    expect(markup).toContain('The anime catalogue is temporarily unavailable')
    expect(markup).toContain('Try again in a moment.')
    expect(markup).toContain('za-button za-button--primary')
    expect(markup).toContain('>Try again</button>')
    expect(markup).not.toContain('private database failure')
    expect(markup).not.toContain('private-digest')
  })
})
