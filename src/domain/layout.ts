export const DEFAULT_MAPPING_FIELD_WIDTH = 300
export const MIN_MAPPING_FIELD_WIDTH = 220
export const MAX_MAPPING_FIELD_WIDTH = 900
export const MIN_RESULT_COLUMN_WIDTH = 96
export const MAX_RESULT_COLUMN_WIDTH = 900
export const DEFAULT_PREVIEW_VALUE_WIDTH = 180
export const MIN_PREVIEW_VALUE_WIDTH = 120
export const MAX_PREVIEW_VALUE_WIDTH = 900

export function clampMappingFieldWidth(width: number): number {
  return Math.min(MAX_MAPPING_FIELD_WIDTH, Math.max(MIN_MAPPING_FIELD_WIDTH, width))
}

export function clampResultColumnWidth(width: number): number {
  return Math.min(MAX_RESULT_COLUMN_WIDTH, Math.max(MIN_RESULT_COLUMN_WIDTH, width))
}

export function clampPreviewValueWidth(width: number): number {
  return Math.min(MAX_PREVIEW_VALUE_WIDTH, Math.max(MIN_PREVIEW_VALUE_WIDTH, width))
}
