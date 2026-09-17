import type {
  ComparisonMode,
  ComparisonResult,
  FieldComparison,
  FieldMapping,
  FlatRow,
  Scalar,
} from './types'

function normalize(value: Scalar | undefined, mode: ComparisonMode): Scalar | undefined {
  if (value === undefined || value === null) return value
  if (mode === 'exact') return value
  if (mode === 'trim') return String(value).trim()
  if (mode === 'text') return String(value)
  if (mode === 'number') {
    if (String(value).trim() === '') return null
    const parsed = Number(value)
    return Number.isNaN(parsed) ? String(value) : parsed
  }

  const text = String(value).trim().toLowerCase()
  if (['true', '1', 'y', 'yes'].includes(text)) return true
  if (['false', '0', 'n', 'no'].includes(text)) return false
  return String(value)
}

interface ComparableRow {
  source: FlatRow
  compared: Record<string, Scalar | undefined>
}

function makeComparable(
  row: FlatRow,
  mappings: FieldMapping[],
  side: 'soap' | 'rest',
): ComparableRow {
  return {
    source: row,
    compared: Object.fromEntries(
      mappings.map((mapping) => [
        mapping.id,
        normalize(
          row[side === 'soap' ? mapping.soapPath : mapping.restPath],
          mapping.comparison,
        ),
      ]),
    ),
  }
}

function keyFor(row: ComparableRow, keyMappings: FieldMapping[]): string | null {
  const values = keyMappings.map((mapping) => row.compared[mapping.id])
  if (values.some((value) => value === undefined || value === null || value === '')) return null
  return values.map((value) => JSON.stringify(value)).join(' | ')
}

interface IndexedRows {
  byKey: Map<string, ComparableRow[]>
  incomplete: ComparableRow[]
}

function indexRows(rows: ComparableRow[], keyMappings: FieldMapping[]): IndexedRows {
  const indexed: IndexedRows = { byKey: new Map(), incomplete: [] }

  rows.forEach((row) => {
    const key = keyFor(row, keyMappings)
    if (key === null) {
      indexed.incomplete.push(row)
      return
    }
    indexed.byKey.set(key, [...(indexed.byKey.get(key) ?? []), row])
  })

  return indexed
}

function labelFor(mapping: FieldMapping): string {
  return mapping.displayName || mapping.soapPath + ' / ' + mapping.restPath
}

function compareFields(
  soap: ComparableRow | undefined,
  rest: ComparableRow | undefined,
  mappings: FieldMapping[],
): FieldComparison[] {
  return mappings.map((mapping) => {
    const comparedSoapValue = soap?.compared[mapping.id]
    const comparedRestValue = rest?.compared[mapping.id]
    const status = soap && rest
      ? Object.is(comparedSoapValue, comparedRestValue) ? 'MATCH' : 'MISMATCH'
      : 'NOT_COMPARED'

    return {
      field: labelFor(mapping),
      status,
      soapValue: soap?.source[mapping.soapPath],
      restValue: rest?.source[mapping.restPath],
      comparedSoapValue,
      comparedRestValue,
      comparison: mapping.comparison,
      isMatchKey: mapping.joinKey,
    }
  })
}

function pairedResult(
  key: string,
  soap: ComparableRow,
  rest: ComparableRow,
  mappings: FieldMapping[],
): ComparisonResult {
  const fieldComparisons = compareFields(soap, rest, mappings)
  return {
    key,
    status: fieldComparisons.some((field) => field.status === 'MISMATCH')
      ? 'MISMATCH'
      : 'MATCH',
    fieldComparisons,
  }
}

export function compareRows(
  soapRows: FlatRow[],
  restRows: FlatRow[],
  mappings: FieldMapping[],
): ComparisonResult[] {
  const activeMappings = mappings.filter(
    (mapping) => mapping.include && mapping.soapPath && mapping.restPath,
  )
  if (activeMappings.length === 0) throw new Error('Enable at least one field mapping.')

  const keyMappings = activeMappings.filter((mapping) => mapping.joinKey)
  if (keyMappings.length === 0) {
    if (soapRows.length !== 1 || restRows.length !== 1) {
      throw new Error('Select at least one Join Key when either response has multiple rows.')
    }
    return [pairedResult(
      'Row 1',
      makeComparable(soapRows[0], activeMappings, 'soap'),
      makeComparable(restRows[0], activeMappings, 'rest'),
      activeMappings,
    )]
  }

  const soap = indexRows(
    soapRows.map((row) => makeComparable(row, activeMappings, 'soap')),
    keyMappings,
  )
  const rest = indexRows(
    restRows.map((row) => makeComparable(row, activeMappings, 'rest')),
    keyMappings,
  )
  const results: ComparisonResult[] = []

  soap.incomplete.forEach((row, index) => {
    results.push({
      key: 'SOAP incomplete #' + (index + 1),
      status: 'INCOMPLETE_KEY',
      fieldComparisons: compareFields(row, undefined, activeMappings),
    })
  })

  rest.incomplete.forEach((row, index) => {
    results.push({
      key: 'REST incomplete #' + (index + 1),
      status: 'INCOMPLETE_KEY',
      fieldComparisons: compareFields(undefined, row, activeMappings),
    })
  })

  const keys = [...new Set([...soap.byKey.keys(), ...rest.byKey.keys()])].sort()

  keys.forEach((key) => {
    const soapMatches = soap.byKey.get(key) ?? []
    const restMatches = rest.byKey.get(key) ?? []

    if (soapMatches.length > 1 || restMatches.length > 1) {
      results.push({ key, status: 'DUPLICATE_KEY', fieldComparisons: [] })
      return
    }
    if (soapMatches.length === 0) {
      results.push({
        key,
        status: 'REST_ONLY',
        fieldComparisons: compareFields(undefined, restMatches[0], activeMappings),
      })
      return
    }
    if (restMatches.length === 0) {
      results.push({
        key,
        status: 'SOAP_ONLY',
        fieldComparisons: compareFields(soapMatches[0], undefined, activeMappings),
      })
      return
    }

    results.push(pairedResult(key, soapMatches[0], restMatches[0], activeMappings))
  })

  return results
}
