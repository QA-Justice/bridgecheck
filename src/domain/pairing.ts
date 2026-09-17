import type { FieldMapping, FlatRow, Scalar } from './types'

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

export interface PairSuggestion {
  soapPath: string
  restPath: string
  confidence: number
  reasons: string[]
}

type ComparableScalar = Exclude<Scalar, null>

const TOKEN_ALIASES: Record<string, string> = {
  addr: 'address',
  amt: 'amount',
  cd: 'code',
  desc: 'description',
  identifier: 'id',
  key: 'id',
  nm: 'name',
  no: 'id',
  num: 'id',
  number: 'id',
  qty: 'quantity',
}

const PATH_NOISE = new Set([
  'body',
  'data',
  'envelope',
  'get',
  'list',
  'request',
  'response',
  'result',
  'results',
  'root',
])

function canonicalToken(token: string): string {
  const normalized = token.toLowerCase()
  const singular = normalized.length > 3
    && normalized.endsWith('s')
    && !['address', 'status'].includes(normalized)
    ? normalized.slice(0, -1)
    : normalized
  return TOKEN_ALIASES[singular] ?? singular
}

function tokensFor(value: string): string[] {
  return value
    .replace(/\[\d+\]/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(canonicalToken)
    .filter((token) => !PATH_NOISE.has(token))
}

function leafTokens(path: string): string[] {
  return tokensFor(path.split('.').at(-1) ?? path)
}

function overlapCoefficient(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0
  const leftSet = new Set(left)
  const rightSet = new Set(right)
  const intersection = [...leftSet].filter((token) => rightSet.has(token)).length
  return intersection / Math.min(leftSet.size, rightSet.size)
}

function jaccardSimilarity(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0
  const leftSet = new Set(left)
  const rightSet = new Set(right)
  const intersection = [...leftSet].filter((token) => rightSet.has(token)).length
  const union = new Set([...leftSet, ...rightSet]).size
  return union === 0 ? 0 : intersection / union
}

function valuesFor(rows: FlatRow[], path: string): ComparableScalar[] {
  return rows
    .map((row) => row[path])
    .filter((value): value is ComparableScalar => (
      value !== undefined && value !== null && value !== ''
    ))
}

function normalizedValue(value: ComparableScalar): string {
  if (typeof value === 'string') return value.trim().toLowerCase()
  return String(value).toLowerCase()
}

function valueKind(value: ComparableScalar): 'boolean' | 'number' | 'string' {
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  const text = value.trim().toLowerCase()
  if (text !== '' && Number.isFinite(Number(text))) return 'number'
  if (['true', 'false', 'yes', 'no', 'y', 'n'].includes(text)) return 'boolean'
  return 'string'
}

function typeCompatibility(left: ComparableScalar[], right: ComparableScalar[]): number {
  if (left.length === 0 || right.length === 0) return 0
  const leftKinds = new Set(left.map(valueKind))
  const rightKinds = new Set(right.map(valueKind))
  return [...leftKinds].some((kind) => rightKinds.has(kind)) ? 1 : 0
}

function valueAgreement(left: ComparableScalar[], right: ComparableScalar[]): number {
  if (left.length === 0 || right.length === 0) return 0
  const rightCounts = new Map<string, number>()
  right.forEach((value) => {
    const normalized = normalizedValue(value)
    rightCounts.set(normalized, (rightCounts.get(normalized) ?? 0) + 1)
  })
  let matches = 0
  left.forEach((value) => {
    const normalized = normalizedValue(value)
    const remaining = rightCounts.get(normalized) ?? 0
    if (remaining > 0) {
      matches += 1
      rightCounts.set(normalized, remaining - 1)
    }
  })
  return matches / Math.max(left.length, right.length)
}

function individualValueStrength(value: ComparableScalar): number {
  const normalized = normalizedValue(value)
  if (valueKind(value) === 'boolean') return 0.2
  if (valueKind(value) === 'number') {
    const numeric = Number(normalized)
    return numeric === 0 || numeric === 1 ? 0.25 : 0.75
  }
  if (normalized.length <= 2) return 0.25
  if (normalized.length <= 4) return 0.55
  return 0.8
}

function valueEvidenceStrength(values: ComparableScalar[]): number {
  if (values.length === 0) return 0
  const uniqueValues = [...new Map<string, ComparableScalar>(
    values.map((value) => [normalizedValue(value), value] as const),
  ).values()]
  const averageStrength = uniqueValues.reduce<number>(
    (sum, value) => sum + individualValueStrength(value),
    0,
  ) / uniqueValues.length
  const diversityBonus = values.length > 1 && uniqueValues.length > 1 ? 0.15 : 0
  return Math.min(1, averageStrength + diversityBonus)
}

function indexRelationship(left: string, right: string): 'match' | 'mismatch' | 'none' {
  const indexes = (path: string) => [...path.matchAll(/\[(\d+)\]/g)].map((match) => match[1])
  const leftIndexes = indexes(left)
  const rightIndexes = indexes(right)
  if (leftIndexes.length === 0 && rightIndexes.length === 0) return 'none'
  if (leftIndexes.length !== rightIndexes.length) return 'mismatch'
  return leftIndexes.every((value, index) => value === rightIndexes[index]) ? 'match' : 'mismatch'
}

interface ScoredPair extends PairSuggestion {
  score: number
}

function scorePair(
  soapRows: FlatRow[],
  restRows: FlatRow[],
  soapPath: string,
  restPath: string,
): ScoredPair | null {
  const indexRelation = indexRelationship(soapPath, restPath)
  if (indexRelation === 'mismatch') return null
  const leafScore = overlapCoefficient(leafTokens(soapPath), leafTokens(restPath))
  const pathScore = jaccardSimilarity(tokensFor(soapPath), tokensFor(restPath))
  const soapValues = valuesFor(soapRows, soapPath)
  const restValues = valuesFor(restRows, restPath)
  const typeScore = typeCompatibility(soapValues, restValues)
  const valueScore = valueAgreement(soapValues, restValues)
  const valueEvidence = valueScore * Math.min(
    valueEvidenceStrength(soapValues),
    valueEvidenceStrength(restValues),
  )
  const indexAdjustment = indexRelation === 'match' ? 0.06 : 0
  const lexicalScore = Math.max(0, Math.min(1,
    leafScore * 0.45
      + pathScore * 0.17
      + typeScore * 0.12
      + valueScore * 0.2
      + indexAdjustment,
  ))
  const valueDrivenScore = Math.max(0, Math.min(1,
    valueEvidence * 0.55
      + typeScore * 0.15
      + pathScore * 0.15
      + leafScore * 0.05
      + (indexRelation === 'match' ? 0.1 : 0),
  ))
  const score = Math.max(lexicalScore, valueDrivenScore)

  if (score < 0.55 || Math.max(leafScore, pathScore, valueEvidence) < 0.5) return null

  const reasons = [
    leafScore >= 0.75 ? 'similar field name' : '',
    pathScore >= 0.45 ? 'similar path' : '',
    valueEvidence >= 0.5 ? 'distinctive matching values' : '',
    typeScore === 1 ? 'compatible type' : '',
    indexRelation === 'match' ? 'matching array position' : '',
  ].filter(Boolean)

  return {
    soapPath,
    restPath,
    confidence: Math.round(score * 100),
    reasons,
    score,
  }
}

export function suggestFieldPairs(
  soapRows: FlatRow[],
  restRows: FlatRow[],
  mappings: FieldMapping[],
): PairSuggestion[] {
  const usedSoapPaths = new Set(mappings.map((mapping) => mapping.soapPath))
  const usedRestPaths = new Set(mappings.map((mapping) => mapping.restPath))
  const soapPaths = [...new Set(soapRows.flatMap((row) => Object.keys(row)))]
    .filter((path) => !usedSoapPaths.has(path))
  const restPaths = [...new Set(restRows.flatMap((row) => Object.keys(row)))]
    .filter((path) => !usedRestPaths.has(path))
  const restPathsByLeafToken = new Map<string, Set<string>>()
  const restPathsByPathToken = new Map<string, Set<string>>()
  const restPathsByValue = new Map<string, Set<string>>()
  const addToIndex = (index: Map<string, Set<string>>, key: string, path: string) => {
    const paths = index.get(key) ?? new Set<string>()
    paths.add(path)
    index.set(key, paths)
  }
  restPaths.forEach((path) => {
    leafTokens(path).forEach((token) => {
      addToIndex(restPathsByLeafToken, token, path)
    })
    tokensFor(path).forEach((token) => addToIndex(restPathsByPathToken, token, path))
    valuesFor(restRows, path).forEach((value) => (
      addToIndex(restPathsByValue, normalizedValue(value), path)
    ))
  })
  const candidates = soapPaths
    .flatMap((soapPath) => {
      const candidatePaths = new Set<string>()
      leafTokens(soapPath).forEach((token) => {
        restPathsByLeafToken.get(token)?.forEach((path) => candidatePaths.add(path))
      })
      tokensFor(soapPath).forEach((token) => {
        restPathsByPathToken.get(token)?.forEach((path) => candidatePaths.add(path))
      })
      valuesFor(soapRows, soapPath).forEach((value) => {
        restPathsByValue.get(normalizedValue(value))?.forEach((path) => candidatePaths.add(path))
      })
      return [...candidatePaths].map((restPath) => (
        scorePair(soapRows, restRows, soapPath, restPath)
      ))
    })
    .filter((candidate): candidate is ScoredPair => candidate !== null)
    .sort((left, right) => (
      right.score - left.score
      || left.soapPath.localeCompare(right.soapPath)
      || left.restPath.localeCompare(right.restPath)
    ))

  const selectedSoapPaths = new Set<string>()
  const selectedRestPaths = new Set<string>()
  const suggestions: PairSuggestion[] = []
  candidates.forEach((candidate) => {
    if (selectedSoapPaths.has(candidate.soapPath) || selectedRestPaths.has(candidate.restPath)) return
    selectedSoapPaths.add(candidate.soapPath)
    selectedRestPaths.add(candidate.restPath)
    suggestions.push({
      soapPath: candidate.soapPath,
      restPath: candidate.restPath,
      confidence: candidate.confidence,
      reasons: candidate.reasons,
    })
  })
  return suggestions
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
