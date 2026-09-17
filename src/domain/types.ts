export type Scalar = string | number | boolean | null
export type NestedValue = Scalar | NestedValue[] | { [key: string]: NestedValue }
export type FlatRow = Record<string, Scalar>

export type ComparisonMode = 'exact' | 'trim' | 'number' | 'text' | 'boolean'

export interface FieldMapping {
  id: string
  soapPath: string
  restPath: string
  displayName: string
  comparison: ComparisonMode
  include: boolean
  joinKey: boolean
}

export type ComparisonStatus =
  | 'MATCH'
  | 'MISMATCH'
  | 'SOAP_ONLY'
  | 'REST_ONLY'
  | 'DUPLICATE_KEY'
  | 'INCOMPLETE_KEY'

export type FieldComparisonStatus = 'MATCH' | 'MISMATCH' | 'NOT_COMPARED'

export interface FieldComparison {
  field: string
  status: FieldComparisonStatus
  soapValue: Scalar | undefined
  restValue: Scalar | undefined
  comparedSoapValue?: Scalar
  comparedRestValue?: Scalar
  comparison: ComparisonMode
  isMatchKey: boolean
}

export interface ComparisonResult {
  key: string
  status: ComparisonStatus
  fieldComparisons: FieldComparison[]
}

export interface ValidationConfig {
  version: 1 | 2
  mappings: FieldMapping[]
}
