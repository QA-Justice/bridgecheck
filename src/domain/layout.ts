export const DEFAULT_MAPPING_FIELD_WIDTH = 300
export const MIN_MAPPING_FIELD_WIDTH = 220
export const MAX_MAPPING_FIELD_WIDTH = 900

export function clampMappingFieldWidth(width: number): number {
  return Math.min(MAX_MAPPING_FIELD_WIDTH, Math.max(MIN_MAPPING_FIELD_WIDTH, width))
}
