const PROTECTED_PATHS = [
  /^\/$/,
  /^\/account\/?$/,
  /^\/bands\/[^/]+\/?$/,
  /^\/bands\/[^/]+\/members\/?$/,
  /^\/bands\/[^/]+\/events\/new\/?$/,
  /^\/bands\/[^/]+\/events\/[^/]+\/?$/,
  /^\/bands\/[^/]+\/events\/[^/]+\/edit\/?$/,
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
  } catch {
    return '/'
  }

  if (
    url.origin !== 'https://bandos.local' ||
    !PROTECTED_PATHS.some((pattern) => pattern.test(decodedPathname))
  ) {
    return '/'
  }

  return `${url.pathname}${url.search}${url.hash}`
}

export function destinationFromLocation(location) {
  return resolveDestination(
    `${location.pathname}${location.search}${location.hash}`,
  )
}
