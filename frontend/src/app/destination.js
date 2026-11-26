const PROTECTED_PATHS = [
  /^\/$/,
  /^\/account\/?$/,
  /^\/bands\/new\/?$/,
  /^\/bands\/[1-9]\d*\/?$/,
  /^\/bands\/[1-9]\d*\/members\/?$/,
  /^\/bands\/[1-9]\d*\/settings\/?$/,
  /^\/bands\/[1-9]\d*\/events\/new\/?$/,
  /^\/bands\/[1-9]\d*\/events\/[1-9]\d*\/?$/,
  /^\/bands\/[1-9]\d*\/events\/[1-9]\d*\/edit\/?$/,
  /^\/bands\/[1-9]\d*\/polls\/new\/?$/,
  /^\/bands\/[1-9]\d*\/polls\/[1-9]\d*(?:\/edit)?\/?$/,
]

function hasControlCharacter(value) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0)
    return codePoint <= 31 || codePoint === 127
  })
}

export function resolveDestination(candidate) {
  if (
    typeof candidate !== 'string' ||
    !candidate.startsWith('/') ||
    candidate.includes('\\') ||
    candidate.startsWith('//') ||
    hasControlCharacter(candidate)
  ) {
    return '/'
  }

  let url
  let decodedPathname

  try {
    url = new URL(candidate, 'https://bandos.local')
    decodedPathname = decodeURIComponent(url.pathname)
    if (decodeURIComponent(candidate.split(/[?#]/)[0]).split('/').some(part => part === '.' || part === '..')) return '/'
  } catch {
    return '/'
  }

  if (
    url.origin !== 'https://bandos.local' ||
    decodedPathname.split('/').some(part => /^\d+$/.test(part) && !Number.isSafeInteger(Number(part))) ||
    hasControlCharacter(decodedPathname) ||
    decodedPathname.includes('\\') ||
    decodedPathname.split('/').some(part => part.includes('%')) ||
    !PROTECTED_PATHS.some((pattern) => pattern.test(decodedPathname))
  ) {
    return '/'
  }

  // Return state contains only known display options, never arbitrary credentials.
  const search = new URLSearchParams()
  for (const key of ['view', 'tab', 'from']) {
    const value = url.searchParams.get(key)
    if (value && /^[a-z-]{1,32}$/i.test(value)) search.set(key, value)
  }
  const hash = /^#[a-z][a-z0-9-]{0,63}$/i.test(url.hash) ? url.hash : ''
  return `${url.pathname}${search.size ? `?${search}` : ''}${hash}`
}

export function destinationFromLocation(location) {
  return resolveDestination(
    `${location.pathname}${location.search}${location.hash}`,
  )
}

// Creation origins are separate from authentication destinations and must return
// to an implemented browsing surface, never back to the creation form itself.
export function resolveCreationOrigin(candidate) {
  const destination = resolveDestination(candidate)
  const path = decodeURIComponent(new URL(destination, 'https://bandos.local').pathname)
  return /^\/$/.test(path) || /^\/bands\/[1-9]\d*(?:\/(?:members|settings))?\/?$/.test(path) &&
    Number.isSafeInteger(Number(path.split('/')[2])) ? destination : '/'
}
