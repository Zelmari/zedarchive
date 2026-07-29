import { expect, type Locator, type Page } from '@playwright/test'

const targetTolerance = 0.5

export async function expectNoPositiveTabindex(page: Page) {
  await expect
    .poll(() =>
      page.locator('[tabindex]').evaluateAll((elements) =>
        elements.some((element) => {
          const value = element.getAttribute('tabindex')
          return value !== null && Number.parseInt(value, 10) > 0
        }),
      ),
    )
    .toBe(false)
}

export async function expectResolvedAriaReferences(page: Page) {
  const unresolved = await page
    .locator('[aria-labelledby], [aria-describedby]')
    .evaluateAll((elements) =>
      elements.flatMap((element) =>
        ['aria-labelledby', 'aria-describedby'].flatMap((attribute) => {
          const value = element.getAttribute(attribute)
          if (value === null) return []

          return value
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .filter((id) => document.getElementById(id) === null)
            .map((id) => ({
              attribute,
              id,
              tagName: element.tagName.toLowerCase(),
            }))
        }),
      ),
    )

  expect(unresolved).toEqual([])
}

export async function expectNoDocumentHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true)
}

export async function applyWcagTextSpacing(page: Page) {
  await page.evaluate(() => {
    document.getElementById('m40-wcag-text-spacing')?.remove()

    const style = document.createElement('style')
    style.id = 'm40-wcag-text-spacing'
    style.textContent = `
      * {
        line-height: 1.5 !important;
        letter-spacing: 0.12em !important;
        word-spacing: 0.16em !important;
      }

      p {
        margin-bottom: 2em !important;
      }
    `
    document.head.append(style)
  })
}

export async function expectTextSpacingLayout(
  page: Page,
  options: {
    controls: Locator[]
    content: Locator[]
  },
) {
  await expectNoDocumentHorizontalOverflow(page)
  const sampledBoxes: Array<{
    height: number
    width: number
    x: number
    y: number
  }> = []

  for (const locator of options.content) {
    await expect(locator).toBeVisible()
    const box = await locator.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(-targetTolerance)
    expect(box!.x + box!.width).toBeLessThanOrEqual(
      (await page.viewportSize())!.width + targetTolerance,
    )
    sampledBoxes.push(box!)
    await expectNotClippedByAncestor(locator)
  }

  for (const locator of options.controls) {
    await expect(locator).toBeVisible()
    await expect(locator).toBeEnabled()
    await locator.scrollIntoViewIfNeeded()
    // A prior pointer-opened dialog keeps Chromium in pointer modality.
    // Tab establishes the keyboard modality that the focus-visible contract
    // is intended to prove before focusing the exact representative target.
    await page.keyboard.press('Tab')
    await locator.focus()
    await expect(locator).toBeFocused()
    await locator.evaluate((element) => {
      element.scrollIntoView({ block: 'center', inline: 'center' })
    })
    await expectTargetAtLeast24Px(locator)
    await expectFocusedTargetAndOutlineReachable(locator)
  }

  for (let index = 0; index < sampledBoxes.length; index += 1) {
    for (
      let comparison = index + 1;
      comparison < sampledBoxes.length;
      comparison += 1
    ) {
      expect(
        boxesOverlap(sampledBoxes[index]!, sampledBoxes[comparison]!),
      ).toBe(false)
    }
  }
}

export async function expectTargetAtLeast24Px(locator: Locator) {
  await expect(locator).toBeVisible()

  const target = await locator.evaluate((element) => {
    if (
      element instanceof HTMLInputElement &&
      (element.type === 'checkbox' || element.type === 'radio')
    ) {
      const label = element.labels?.[0]
      if (label) return label.getBoundingClientRect().toJSON()
    }

    return element.getBoundingClientRect().toJSON()
  })

  expect(target.width).toBeGreaterThanOrEqual(24 - targetTolerance)
  expect(target.height).toBeGreaterThanOrEqual(24 - targetTolerance)
}

async function expectFocusedTargetAndOutlineReachable(locator: Locator) {
  const evidence = await locator.evaluate((element) => {
    const style = getComputedStyle(element)
    const outlineWidth = Number.parseFloat(style.outlineWidth)
    const outlineOffset = Number.parseFloat(style.outlineOffset)
    const outlineExtent = Math.max(0, outlineWidth + outlineOffset)
    const target = element.getBoundingClientRect()
    const outlinedTarget = {
      bottom: target.bottom + outlineExtent,
      left: target.left - outlineExtent,
      right: target.right + outlineExtent,
      top: target.top - outlineExtent,
    }
    const clippingAncestors: string[] = []
    const clippingValues = new Set(['auto', 'clip', 'hidden', 'scroll'])
    let ancestor = element.parentElement

    while (ancestor && ancestor !== document.documentElement) {
      const ancestorStyle = getComputedStyle(ancestor)
      const bounds = ancestor.getBoundingClientRect()
      const clientBounds = {
        bottom: bounds.top + ancestor.clientTop + ancestor.clientHeight,
        left: bounds.left + ancestor.clientLeft,
        right: bounds.left + ancestor.clientLeft + ancestor.clientWidth,
        top: bounds.top + ancestor.clientTop,
      }
      const clipsX = clippingValues.has(ancestorStyle.overflowX)
      const clipsY = clippingValues.has(ancestorStyle.overflowY)

      if (
        (clipsX &&
          (outlinedTarget.left < clientBounds.left ||
            outlinedTarget.right > clientBounds.right)) ||
        (clipsY &&
          (outlinedTarget.top < clientBounds.top ||
            outlinedTarget.bottom > clientBounds.bottom))
      ) {
        clippingAncestors.push(
          `${ancestor.tagName.toLowerCase()}:${ancestorStyle.overflowX}/${ancestorStyle.overflowY}`,
        )
      }
      ancestor = ancestor.parentElement
    }

    const insetX = Math.min(2, target.width / 4)
    const insetY = Math.min(2, target.height / 4)
    const samplePoints = [
      [target.left + insetX, target.top + insetY],
      [target.right - insetX, target.top + insetY],
      [target.left + insetX, target.bottom - insetY],
      [target.right - insetX, target.bottom - insetY],
      [target.left + target.width / 2, target.top + target.height / 2],
    ]
    const hasUnobscuredPoint = samplePoints.some(([x, y]) => {
      if (
        x === undefined ||
        y === undefined ||
        x < 0 ||
        y < 0 ||
        x >= window.innerWidth ||
        y >= window.innerHeight
      ) {
        return false
      }
      const hit = document.elementFromPoint(x, y)
      return hit !== null && (hit === element || element.contains(hit))
    })

    return {
      clippingAncestors,
      hasUnobscuredPoint,
      outlineColor: style.outlineColor,
      outlinedTarget,
      outlineStyle: style.outlineStyle,
      outlineWidth,
      viewport: {
        height: window.innerHeight,
        width: window.innerWidth,
      },
    }
  })

  expect(evidence.outlineStyle).not.toBe('none')
  expect(evidence.outlineWidth).toBeGreaterThanOrEqual(3 - targetTolerance)
  expect(evidence.outlineColor).not.toBe('transparent')
  expect(evidence.outlineColor).not.toBe('rgba(0, 0, 0, 0)')
  expect(evidence.outlinedTarget.left).toBeGreaterThanOrEqual(-targetTolerance)
  expect(evidence.outlinedTarget.top).toBeGreaterThanOrEqual(-targetTolerance)
  expect(evidence.outlinedTarget.right).toBeLessThanOrEqual(
    evidence.viewport.width + targetTolerance,
  )
  expect(evidence.outlinedTarget.bottom).toBeLessThanOrEqual(
    evidence.viewport.height + targetTolerance,
  )
  expect(evidence.clippingAncestors).toEqual([])
  expect(evidence.hasUnobscuredPoint).toBe(true)
}

async function expectNotClippedByAncestor(locator: Locator) {
  const clipping = await locator.evaluate((element) => {
    const target = element.getBoundingClientRect()
    let ancestor = element.parentElement

    while (ancestor) {
      const style = getComputedStyle(ancestor)
      if (
        style.overflowX === 'clip' ||
        style.overflowX === 'hidden' ||
        style.overflowY === 'clip' ||
        style.overflowY === 'hidden'
      ) {
        const bounds = ancestor.getBoundingClientRect()
        if (
          target.left < bounds.left ||
          target.top < bounds.top ||
          target.right > bounds.right ||
          target.bottom > bounds.bottom
        ) {
          return ancestor.tagName.toLowerCase()
        }
      }
      ancestor = ancestor.parentElement
    }

    return null
  })

  expect(clipping).toBeNull()
}

function boxesOverlap(
  first: { height: number; width: number; x: number; y: number },
  second: { height: number; width: number; x: number; y: number },
) {
  return (
    first.x < second.x + second.width - targetTolerance &&
    first.x + first.width > second.x + targetTolerance &&
    first.y < second.y + second.height - targetTolerance &&
    first.y + first.height > second.y + targetTolerance
  )
}

export async function expectRepresentativeAccessibilityBasics(page: Page) {
  await expectNoPositiveTabindex(page)
  await expectResolvedAriaReferences(page)
}
