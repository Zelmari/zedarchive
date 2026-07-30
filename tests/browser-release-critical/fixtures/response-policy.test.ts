import assert from 'node:assert/strict'
import test from 'node:test'
import type { Response } from '@playwright/test'
import {
  buildDynamicContentSecurityPolicy,
  commonSecurityHeaders,
  staticContentSecurityPolicy,
} from '../../../src/config/security-headers'
import {
  assertDynamicResponsePolicy,
  assertStaticResponsePolicy,
} from './response-policy'

function responseWithHeaders(
  headers: Readonly<Record<string, string | readonly string[]>>,
  body = '',
): Response {
  const entries = Object.entries(headers).flatMap(([name, value]) =>
    (Array.isArray(value) ? value : [value]).map((item) => ({
      name,
      value: item,
    })),
  )
  return {
    status() {
      return 200
    },
    async headerValue(name: string) {
      const match = entries.find(
        (entry) => entry.name.toLowerCase() === name.toLowerCase(),
      )
      return match?.value ?? null
    },
    async headersArray() {
      return entries
    },
    async text() {
      return body
    },
  } as unknown as Response
}

test('accepts bounded dynamic and static response-policy facts', async () => {
  const nonce = 'YWJjZA=='
  await assertDynamicResponsePolicy(
    responseWithHeaders(
      {
        'cache-control': 'private, no-store, max-age=0',
        ...commonSecurityHeaders,
        'content-security-policy': buildDynamicContentSecurityPolicy(nonce, {
          development: false,
        }),
        'content-type': 'text/html; charset=utf-8',
      },
      `<script nonce="${nonce}"></script><style nonce="${nonce}"></style>`,
    ),
    { cache: 'private-no-store', contentType: 'html', status: 200 },
  )
  await assertStaticResponsePolicy(
    responseWithHeaders({
      ...commonSecurityHeaders,
      'content-security-policy': staticContentSecurityPolicy,
    }),
  )
  await assertDynamicResponsePolicy(
    responseWithHeaders({
      ...commonSecurityHeaders,
      'Referrer-Policy': 'no-referrer',
      'content-security-policy': buildDynamicContentSecurityPolicy(nonce, {
        development: false,
      }),
      'content-type': 'application/json; charset=utf-8',
    }),
    {
      contentType: 'json',
      referrerPolicy: 'no-referrer',
      status: 200,
    },
  )
})

test('rejects duplicate or nonce-mismatched response-policy facts', async () => {
  const nonce = 'YWJjZA=='
  await assert.rejects(() =>
    assertDynamicResponsePolicy(
      responseWithHeaders(
        {
          ...commonSecurityHeaders,
          'content-security-policy': [
            buildDynamicContentSecurityPolicy(nonce, { development: false }),
            buildDynamicContentSecurityPolicy(nonce, { development: false }),
          ],
          'content-type': 'text/html; charset=utf-8',
        },
        '<script nonce="different"></script>',
      ),
      { contentType: 'html', status: 200 },
    ),
  )
})
