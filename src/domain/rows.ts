import type { FlatRow, NestedValue, Scalar } from './types'

function isRecord(value: NestedValue): value is { [key: string]: NestedValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function valuePath(prefix: string): string {
  return prefix || 'value'
}

function flattenValue(value: NestedValue, prefix: string, output: FlatRow): void {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      output[valuePath(prefix)] = '[]'
      return
    }
    value.forEach((item, index) => {
      flattenValue(item, prefix + '[' + index + ']', output)
    })
    return
  }

  if (isRecord(value)) {
    const entries = Object.entries(value)
    if (entries.length === 0) {
      output[valuePath(prefix)] = '{}'
      return
    }
    entries.forEach(([key, child]) => {
      flattenValue(child, prefix ? prefix + '.' + key : key, output)
    })
    return
  }

  output[valuePath(prefix)] = value as Scalar
}

export function flattenRow(value: NestedValue): FlatRow {
  const output: FlatRow = {}
  flattenValue(value, '', output)
  return output
}

export function rowsFromDocument(root: NestedValue): FlatRow[] {
  if (Array.isArray(root)) return root.map((value) => flattenRow(value))
  return [flattenRow(root)]
}

export function collectFields(rows: FlatRow[]): string[] {
  return [...new Set(rows.flatMap((row) => Object.keys(row)))]
}

export function filterFieldPaths(fields: string[], query: string): string[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return fields
  return fields.filter((field) => field.toLocaleLowerCase().includes(normalizedQuery))
}

export function pivotRows(rows: FlatRow[]): FlatRow[] {
  return collectFields(rows).map((field) => {
    const pivotedRow: FlatRow = { Field: field }

    rows.forEach((row, index) => {
      const value = row[field]
      pivotedRow['Row ' + (index + 1)] = value === undefined ? '' : value
    })

    return pivotedRow
  })
}
