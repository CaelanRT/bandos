import { formatDateHeading } from '../events/schedule.js'

export function groupDatebookEvents(events, now) {
  const groups = []
  for (const entry of events) {
    const last = groups.at(-1)
    if (last?.date === entry.event.date) last.events.push(entry)
    else groups.push({ date: entry.event.date, label: formatDateHeading(entry.event.date, now), events: [entry] })
  }
  return groups
}
