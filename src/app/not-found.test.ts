import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import NotFound from '@/app/not-found'

describe('NotFound', () => {
  it('offers the bounded archive recovery route with the approved copy', () => {
    const markup = renderToStaticMarkup(NotFound())

    expect(markup).toContain('Misfiled page')
    expect(markup).toContain('This page isn’t on the shelf.')
    expect(markup).toContain(
      'The address may be wrong, or the page may have moved.',
    )
    expect(markup).toContain('href="/"')
    expect(markup).toContain('Return to the anime catalogue')
  })
})
