import { createHash } from 'node:crypto'
import type { CalendarEvent } from '../shared/types'

function unescape(value: string): string {
  return value.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim()
}

function property(block: string, name: string): { value: string; parameters: string } {
  const line = block.split(/\r?\n/).find(row => row.toUpperCase().startsWith(`${name}:`) || row.toUpperCase().startsWith(`${name};`))
  if (!line) return { value: '', parameters: '' }
  const colon = line.indexOf(':')
  return { value: unescape(line.slice(colon + 1)), parameters: line.slice(0, colon) }
}

function dateValue(value: string, parameters: string): { iso: string; allDay: boolean } | null {
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(value)
  if (dateOnly || parameters.includes('VALUE=DATE')) {
    const match = dateOnly ?? /^(\d{4})(\d{2})(\d{2})T/.exec(value)
    if (!match) return null
    return { iso: new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`).toISOString(), allDay: true }
  }
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(value)
  if (!match) return null
  return { iso: new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.000Z`).toISOString(), allDay: false }
}

export function parseIcs(text: string, source: string): CalendarEvent[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, '')
  const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/gi) ?? []
  const importedAt = new Date().toISOString()
  return blocks.map(block => {
    const uid = property(block, 'UID').value
    const summary = property(block, 'SUMMARY').value
    const startProperty = property(block, 'DTSTART')
    const start = dateValue(startProperty.value, startProperty.parameters)
    if (!uid || !summary || !start) return null
    const endProperty = property(block, 'DTEND')
    const end = endProperty.value ? dateValue(endProperty.value, endProperty.parameters) : null
    return {
      id: createHash('sha1').update(`${source}:${uid}`).digest('hex'), uid, summary,
      description: property(block, 'DESCRIPTION').value,
      start: start.iso, end: end?.iso ?? null, allDay: start.allDay,
      source, importedAt,
    }
  }).filter((event): event is CalendarEvent => event !== null)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
}
