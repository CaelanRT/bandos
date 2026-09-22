const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/
const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isRealDate(value) {
  const match = typeof value === 'string' && value.match(datePattern)
  if (!match) return false
  const [, year, month, day] = match.map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export const isTime = (value) => typeof value === 'string' && timePattern.test(value)
export const isLaterSameDay = (start, end) => isTime(start) && isTime(end) && end > start

export function isSupportedTimezone(timezone) {
  if (typeof timezone !== 'string' || (timezone !== 'UTC' && !timezone.includes('/'))) return false
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(); return true } catch { return false }
}

function partsAt(instant, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant)
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]))
}
function offsetAt(instant, timezone) {
  const parts = partsAt(instant, timezone)
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - instant.getTime()
}

export function resolveLocalDateTime(date, time, timezone) {
  if (!isRealDate(date) || !isTime(time) || !isSupportedTimezone(timezone)) return null
  const [, year, month, day] = date.match(datePattern).map(Number)
  const [, hour, minute] = time.match(timePattern).map(Number)
  const wallTime = Date.UTC(year, month - 1, day, hour, minute)
  const offsets = new Set([-24, -12, 0, 12, 24].map((hours) => offsetAt(new Date(wallTime + hours * 3600000), timezone)))
  const matches = [...offsets].map((offset) => new Date(wallTime - offset)).filter((candidate) => {
    const parts = partsAt(candidate, timezone)
    return parts.year === year && parts.month === month && parts.day === day && parts.hour === hour && parts.minute === minute
  })
  return matches.length ? new Date(Math.min(...matches.map((match) => match.getTime()))) : null
}

export function classifyEvent(event, now = new Date()) {
  const start = resolveLocalDateTime(event.date, event.startTime, event.timezone)
  return start === null ? null : start > now ? 'upcoming' : 'past'
}

export function isEventEditable(event, now = new Date()) {
  return classifyEvent(event, now) === 'upcoming'
}

export function groupEvents(events, now = new Date()) {
  const groups = { upcoming: new Map(), past: new Map() }
  events.forEach((event) => {
    const classification = classifyEvent(event, now)
    if (classification !== null) {
      const group = groups[classification]
      group.set(event.date, [...(group.get(event.date) ?? []), event])
    }
  })
  return Object.fromEntries(Object.entries(groups).map(([classification, dates]) => [classification,
    [...dates].sort(([left], [right]) => classification === 'upcoming' ? left.localeCompare(right) : right.localeCompare(left))
      .map(([date, events]) => ({ date, label: formatDateHeading(date, now), events })),
  ]))
}

export function formatDateHeading(date, now = new Date()) {
  if (!isRealDate(date)) return null
  const [, year, month, day] = date.match(datePattern).map(Number)
  const calendarDay = Date.UTC(year, month - 1, day) / 86400000
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000
  if (calendarDay === today) return 'Today'
  if (calendarDay === today + 1) return 'Tomorrow'
  if (calendarDay === today - 1) return 'Yesterday'
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(year, month - 1, day))
}

export function formatLocalTime(time) {
  if (!isTime(time)) return null
  const [, hour, minute] = time.match(timePattern).map(Number)
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' }).format(new Date(Date.UTC(2000, 0, 1, hour, minute)) )
}

export function nextStartBoundary(events, now = new Date()) {
  const starts = events.map((event) => resolveLocalDateTime(event.date, event.startTime, event.timezone)).filter((start) => start !== null && start > now)
  return starts.length ? new Date(Math.min(...starts.map((start) => start.getTime()))) : null
}

export function nextBrowserCalendarBoundary(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
}
