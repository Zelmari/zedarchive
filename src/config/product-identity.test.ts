import { describe, expect, it } from 'vitest'
import { productName, repositoryUrl } from '@/config/product-identity'

describe('product identity', () => {
  it('exports the canonical product name and repository URL', () => {
    expect(productName).toBe('zedarchive')
    expect(repositoryUrl).toBe('https://github.com/Zelmari/zedarchive')
  })
})
