import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createHibpFetchRedirect,
  installHibpFetchRedirect,
  isExactHibpRangeRequest,
} from './hibp-fetch-redirect.mjs'

const exactUrl = 'https://api.pwnedpasswords.com/range/ABCDE'
const collectorUrl = 'http://127.0.0.1:43135/__m41/hibp-range'

function exactBetterFetchContext(url) {
  return {
    headers: new Headers({
      'Add-Padding': 'true',
      'User-Agent': 'BetterAuth Password Checker',
    }),
    url,
    body: null,
    method: 'GET',
    signal: new AbortController().signal,
  }
}

test('matches only the pinned provider context for the exact range request', () => {
  assert.equal(isExactHibpRangeRequest(exactUrl), false)
  assert.equal(isExactHibpRangeRequest(new URL(exactUrl)), false)
  assert.equal(isExactHibpRangeRequest(new Request(exactUrl)), false)
  const providerUrl = new URL(exactUrl)
  assert.equal(
    isExactHibpRangeRequest(providerUrl, exactBetterFetchContext(providerUrl)),
    true,
  )

  for (const rejected of [
    'http://api.pwnedpasswords.com/range/ABCDE',
    'https://api.pwnedpasswords.com/range/abcde',
    'https://api.pwnedpasswords.com/range/ABCD',
    'https://api.pwnedpasswords.com/range/ABCDE/',
    'https://api.pwnedpasswords.com/range/ABCDE?mode=test',
    'https://api.pwnedpasswords.com/range/ABCDE#fragment',
    'https://api.pwnedpasswords.com/range/ABCDE%3Fmode=test',
    'https://api.pwnedpasswords.com/other/ABCDE',
    'https://example.test/range/ABCDE',
  ]) {
    assert.equal(isExactHibpRangeRequest(rejected), false)
  }

  assert.equal(
    isExactHibpRangeRequest(new Request(exactUrl, { method: 'POST' })),
    false,
  )
  assert.equal(isExactHibpRangeRequest(exactUrl, {}), false)
  assert.equal(isExactHibpRangeRequest(exactUrl, { method: 'GET' }), false)
  assert.equal(isExactHibpRangeRequest({ url: exactUrl }), false)
})

test('redirects without forwarding the hash prefix', async () => {
  const calls = []
  const originalFetch = async (...args) => {
    calls.push(args)
    return new Response('', { status: 200 })
  }
  const redirectedFetch = createHibpFetchRedirect(originalFetch)

  const providerUrl = new URL(exactUrl)
  await redirectedFetch(providerUrl, exactBetterFetchContext(providerUrl))

  assert.deepEqual(calls, [[collectorUrl]])
  assert.equal(JSON.stringify(calls).includes('ABCDE'), false)
})

test('passes unrelated requests through with their original identity', async () => {
  const input = new Request('https://example.test/resource', {
    method: 'POST',
    body: 'safe-public-body',
  })
  const init = { redirect: 'manual' }
  const originalFetch = async (receivedInput, receivedInit) => {
    assert.equal(receivedInput, input)
    assert.equal(receivedInit, init)
    return new Response('pass-through', { status: 202 })
  }

  const response = await createHibpFetchRedirect(originalFetch)(input, init)
  assert.equal(response.status, 202)
})

test('keeps the redirect active when the server runtime replaces global fetch', async () => {
  const calls = []
  const target = {
    fetch: async (...args) => {
      calls.push(['initial', ...args])
      return new Response('')
    },
  }
  installHibpFetchRedirect(target)

  target.fetch = async (...args) => {
    calls.push(['replacement', ...args])
    return new Response('')
  }

  const providerUrl = new URL(exactUrl)
  await target.fetch(providerUrl, exactBetterFetchContext(providerUrl))
  await target.fetch('https://example.test/public')

  assert.deepEqual(calls, [
    ['replacement', collectorUrl],
    ['replacement', 'https://example.test/public', undefined],
  ])
})

test('fails closed for every unexpected request on the HIBP origin', async () => {
  let calls = 0
  const redirectedFetch = createHibpFetchRedirect(async () => {
    calls += 1
    return new Response('')
  })

  for (const [input, init] of [
    [exactUrl, undefined],
    [new URL(exactUrl), undefined],
    [new Request(exactUrl), undefined],
    ['https://api.pwnedpasswords.com/range/abcde', undefined],
    [exactUrl, {}],
    [new Request(exactUrl, { method: 'POST' }), undefined],
    [{ url: exactUrl }, undefined],
    [
      new URL(exactUrl),
      {
        ...exactBetterFetchContext(new URL(exactUrl)),
        headers: {
          'Add-Padding': 'false',
          'User-Agent': 'BetterAuth Password Checker',
        },
      },
    ],
    [
      new URL(exactUrl),
      { ...exactBetterFetchContext(new URL(exactUrl)), method: 'POST' },
    ],
    [
      new URL(exactUrl),
      { ...exactBetterFetchContext(new URL(exactUrl)), arbitrary: true },
    ],
  ]) {
    await assert.rejects(
      () => redirectedFetch(input, init),
      /M41 HIBP request/u,
    )
  }

  assert.equal(calls, 0)
})
