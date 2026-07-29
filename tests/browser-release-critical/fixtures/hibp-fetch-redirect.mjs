const hibpOrigin = 'https://api.pwnedpasswords.com'
const hibpRangePathPattern = /^\/range\/[A-F0-9]{5}$/u
const collectorUrl = 'http://127.0.0.1:43135/__m41/hibp-range'

function inputUrl(input) {
  if (
    typeof input === 'string' ||
    input instanceof URL ||
    input instanceof Request
  ) {
    try {
      return new URL(input instanceof Request ? input.url : input)
    } catch {
      return null
    }
  }

  return null
}

function isHibpOrigin(url) {
  return url !== null && url.origin === hibpOrigin
}

function resemblesHibpInput(input) {
  return (
    typeof input === 'object' &&
    input !== null &&
    'url' in input &&
    typeof input.url === 'string' &&
    input.url.startsWith(`${hibpOrigin}/`)
  )
}

function hasExactProviderHeaders(value) {
  let headers
  try {
    headers = new Headers(value)
  } catch {
    return false
  }

  const entries = [...headers.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )
  return (
    entries.length === 2 &&
    entries[0]?.[0] === 'add-padding' &&
    entries[0]?.[1] === 'true' &&
    entries[1]?.[0] === 'user-agent' &&
    entries[1]?.[1] === 'BetterAuth Password Checker'
  )
}

function isExactBetterFetchContext(init, input) {
  if (
    typeof init !== 'object' ||
    init === null ||
    Array.isArray(init) ||
    Object.getPrototypeOf(init) !== Object.prototype
  ) {
    return false
  }

  const keys = Object.keys(init).sort()
  return (
    keys.length === 5 &&
    keys[0] === 'body' &&
    keys[1] === 'headers' &&
    keys[2] === 'method' &&
    keys[3] === 'signal' &&
    keys[4] === 'url' &&
    init.body === null &&
    init.method === 'GET' &&
    init.url === input &&
    init.signal instanceof AbortSignal &&
    hasExactProviderHeaders(init.headers)
  )
}

export function isExactHibpRangeRequest(input, init) {
  const url = inputUrl(input)
  if (
    !isHibpOrigin(url) ||
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== '' ||
    !hibpRangePathPattern.test(url.pathname) ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    return false
  }

  const method = input instanceof Request ? input.method : 'GET'
  if (method !== 'GET') {
    return false
  }

  return (
    init !== undefined &&
    input instanceof URL &&
    isExactBetterFetchContext(init, input)
  )
}

export function createHibpFetchRedirect(originalFetch) {
  if (typeof originalFetch !== 'function') {
    throw new TypeError('M41 HIBP redirect requires a fetch implementation')
  }

  return async function redirectedFetch(input, init) {
    const url = inputUrl(input)

    if (!isHibpOrigin(url)) {
      if (resemblesHibpInput(input)) {
        throw new TypeError('M41 HIBP request used an unsupported input')
      }
      return originalFetch(input, init)
    }

    if (!isExactHibpRangeRequest(input, init)) {
      throw new TypeError('M41 HIBP request did not match the fixed boundary')
    }

    return originalFetch(collectorUrl)
  }
}

export function installHibpFetchRedirect(target) {
  if (
    typeof target !== 'object' ||
    target === null ||
    typeof target.fetch !== 'function'
  ) {
    throw new TypeError('M41 HIBP redirect could not find global fetch')
  }

  let redirectedFetch = createHibpFetchRedirect(target.fetch)

  Object.defineProperty(target, 'fetch', {
    configurable: true,
    enumerable: true,
    get() {
      return redirectedFetch
    },
    set(nextFetch) {
      if (nextFetch === redirectedFetch) {
        return
      }
      redirectedFetch = createHibpFetchRedirect(nextFetch)
    },
  })
}

installHibpFetchRedirect(globalThis)
