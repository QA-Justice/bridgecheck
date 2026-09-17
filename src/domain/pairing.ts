import type { FieldMapping } from './types'

export type MappingSide = 'soap' | 'rest'

export interface FieldSelection {
  side: MappingSide
  path: string
}

export interface PairingUpdate {
  mappings: FieldMapping[]
  pending: FieldSelection | null
  activePairId: string | null
  created: boolean
}

export function mappingForField(
  mappings: FieldMapping[],
  side: MappingSide,
  path: string,
): FieldMapping | undefined {
  return mappings.find((mapping) => (
    side === 'soap' ? mapping.soapPath === path : mapping.restPath === path
  ))
}

export function applyFieldSelection(
  mappings: FieldMapping[],
  pending: FieldSelection | null,
  selection: FieldSelection,
  newId: string,
): PairingUpdate {
  const existing = mappingForField(mappings, selection.side, selection.path)
  if (existing) {
    return {
      mappings,
      pending: null,
      activePairId: existing.id,
      created: false,
    }
  }

  if (!pending) {
    return { mappings, pending: selection, activePairId: null, created: false }
  }

  if (pending.side === selection.side) {
    return {
      mappings,
      pending: pending.path === selection.path ? null : selection,
      activePairId: null,
      created: false,
    }
  }

  const mapping: FieldMapping = {
    id: newId,
    soapPath: selection.side === 'soap' ? selection.path : pending.path,
    restPath: selection.side === 'rest' ? selection.path : pending.path,
    displayName: '',
    comparison: 'exact',
    include: true,
    joinKey: false,
  }

  return {
    mappings: [...mappings, mapping],
    pending: null,
    activePairId: mapping.id,
    created: true,
  }
}
