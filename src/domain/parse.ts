import { XMLParser, XMLValidator } from 'fast-xml-parser'
import type { NestedValue } from './types'

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: false,
  textNodeName: '#text',
})

function cleanXmlValue(value: unknown): NestedValue {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(cleanXmlValue)

  const record = value as Record<string, unknown>
  if (record['@_nil'] === 'true' || record['@_nil'] === true || record['@_nil'] === '1') return null

  const elementEntries = Object.entries(record).filter(
    ([key]) => !key.startsWith('@_') && key !== '#text',
  )
  if (elementEntries.length === 0 && '#text' in record) {
    return cleanXmlValue(record['#text'])
  }

  return Object.fromEntries(
    elementEntries.map(([key, child]) => [key, cleanXmlValue(child)]),
  ) as NestedValue
}

export function parseXml(input: string): NestedValue {
  const validation = XMLValidator.validate(input)
  if (validation !== true) {
    throw new Error(`XML ${validation.err.msg} (${validation.err.line}:${validation.err.col})`)
  }
  return cleanXmlValue(xmlParser.parse(input))
}

export function parseJson(input: string): NestedValue {
  try {
    return JSON.parse(input) as NestedValue
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown parsing error'
    throw new Error(`JSON ${message}`)
  }
}
