export const DEFAULT_MAPPING_FIELD_WIDTH = 300
export const MIN_MAPPING_FIELD_WIDTH = 220
export const MAX_MAPPING_FIELD_WIDTH = 900
export const MIN_RESULT_COLUMN_WIDTH = 96
export const MAX_RESULT_COLUMN_WIDTH = 900

export function clampMappingFieldWidth(width: number): number {
  return Math.min(MAX_MAPPING_FIELD_WIDTH, Math.max(MIN_MAPPING_FIELD_WIDTH, width))
}

export function clampResultColumnWidth(width: number): number {
  return Math.min(MAX_RESULT_COLUMN_WIDTH, Math.max(MIN_RESULT_COLUMN_WIDTH, width))
}
