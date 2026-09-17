import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import packageJson from '../package.json'
import {
  ArrowLeftRight,
  Check,
  ChevronRight,
  Download,
  FileJson,
  FileUp,
  Link2,
  Play,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Rows3,
  Table2,
  Trash2,
  Unlink,
  Upload,
  X,
} from 'lucide-react'
import './App.css'
import { compareRows } from './domain/compare'
import { clampMappingFieldWidth, DEFAULT_MAPPING_FIELD_WIDTH } from './domain/layout'
import { applyFieldSelection, mappingForField } from './domain/pairing'
import type { FieldSelection, MappingSide } from './domain/pairing'
import { parseJson, parseXml } from './domain/parse'
import { collectFields, filterFieldPaths, pivotRows, rowsFromDocument } from './domain/rows'
import type {
  ComparisonMode,
  ComparisonResult,
  ComparisonStatus,
  FieldComparison,
  FieldMapping,
  FlatRow,
  Scalar,
  ValidationConfig,
} from './domain/types'
import {
  sampleMappings,
  sampleRest,
  sampleSoap,
} from './samples'

type Tab = 'data' | 'mapping' | 'results'
type StatusFilter = 'ALL' | 'MATCH' | 'MISMATCH'
type FieldStatusFilter = 'ALL' | 'MISMATCH'
type MappingSource = 'sample' | 'manual' | 'imported'
type MappingFieldColumn = 'soap' | 'rest'

interface ResultTableRow {
  result: ComparisonResult
  field?: FieldComparison
}

interface MappingColumnResize {
  column: MappingFieldColumn
  startX: number
  startWidth: number
}

const comparisonOptions: { value: ComparisonMode; label: string }[] = [
  { value: 'exact', label: 'Exact' },
  { value: 'trim', label: 'Trim Whitespace' },
  { value: 'number', label: 'As Number' },
  { value: 'text', label: 'As Text' },
  { value: 'boolean', label: 'As Boolean' },
]

const visibleStatuses = ['MATCH', 'MISMATCH'] as const satisfies readonly ComparisonStatus[]

function comparisonLabel(mode: ComparisonMode): string {
  return comparisonOptions.find((option) => option.value === mode)?.label ?? mode
}

function formatValue(value: Scalar | undefined): string {
  if (value === undefined) return '--'
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  return String(value)
}

function formatKey(key: string): string {
  return key
    .split(' | ')
    .map((part) => {
      try {
        return String(JSON.parse(part))
      } catch {
        return part
      }
    })
    .join(' / ')
}

function downloadFile(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

function readFile(file: File, onRead: (value: string) => void): void {
  const reader = new FileReader()
  reader.onload = () => onRead(String(reader.result ?? ''))
  reader.readAsText(file)
}

interface FieldSearchProps {
  label: string
  fields: string[]
  value: string
  invalid: boolean
  onChange: (value: string) => void
}

function FieldSearch({ label, fields, value, invalid, onChange }: FieldSearchProps) {
  const listId = useId()
  const [query, setQuery] = useState(value)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const matches = useMemo(
    () => filterFieldPaths(fields, query),
    [fields, query],
  )

  useEffect(() => setQuery(value), [value])

  function choose(field: string): void {
    onChange(field)
    setQuery(field)
    setIsOpen(false)
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setIsOpen(true)
      setActiveIndex((index) => Math.min(index + 1, Math.max(matches.length - 1, 0)))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setIsOpen(true)
      setActiveIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter' && isOpen && matches[activeIndex]) {
      event.preventDefault()
      choose(matches[activeIndex])
    } else if (event.key === 'Escape') {
      setQuery(value)
      setIsOpen(false)
    }
  }

  return (
    <div className={'field-search' + (isOpen ? ' is-open' : '')}>
      <Search className="field-search-icon" size={14} aria-hidden="true" />
      <input
        className={'field-search-input' + (invalid ? ' is-invalid' : '')}
        type="text"
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={listId}
        autoComplete="off"
        value={query}
        title={value || undefined}
        placeholder={'Search ' + label.toLowerCase()}
        onFocus={(event) => {
          event.currentTarget.select()
          setActiveIndex(0)
          setIsOpen(true)
        }}
        onChange={(event) => {
          setQuery(event.target.value)
          setActiveIndex(0)
          setIsOpen(true)
        }}
        onBlur={() => {
          setQuery(value)
          setIsOpen(false)
        }}
        onKeyDown={handleKeyDown}
      />
      {isOpen && (
        <div
          className="field-search-options"
          id={listId}
          role="listbox"
        >
          {matches.length > 0 ? matches.map((field, index) => (
            <button
              className={'field-search-option' + (index === activeIndex ? ' is-active' : '')}
              type="button"
              role="option"
              aria-selected={field === value}
              title={field}
              key={field}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(field)}
            >
              <span>{field}</span>
              {field === value && <Check size={14} aria-hidden="true" />}
            </button>
          )) : (
            <div className="field-search-empty">No matching fields</div>
          )}
        </div>
      )}
    </div>
  )
}

interface DataPanelProps {
  kind: 'SOAP' | 'REST'
  format: 'XML' | 'JSON'
  value: string
  onChange: (value: string) => void
  onParse: () => void
  isParsed: boolean
  rows: FlatRow[]
  mappings: FieldMapping[]
  pendingField: FieldSelection | null
  activePairId: string | null
  onSelectField: (side: MappingSide, path: string) => void
  onRemovePair: (id: string) => void
}

function DataPanel({
  kind,
  format,
  value,
  onChange,
  onParse,
  isParsed,
  rows,
  mappings,
  pendingField,
  activePairId,
  onSelectField,
  onRemovePair,
}: DataPanelProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [isPivoted, setIsPivoted] = useState(true)
  const [fieldQuery, setFieldQuery] = useState('')
  const [showUnpairedOnly, setShowUnpairedOnly] = useState(false)
  const side: MappingSide = kind === 'SOAP' ? 'soap' : 'rest'
  const pivotedRows = pivotRows(rows)
  const filteredPivotRows = pivotedRows.filter((row) => {
    const path = String(row.Field ?? '')
    if (!filterFieldPaths([path], fieldQuery).length) return false
    return !showUnpairedOnly || !mappingForField(mappings, side, path)
  })
  const displayRows = isPivoted ? filteredPivotRows : rows
  const displayFields = collectFields(displayRows)
  const fields = collectFields(rows)
  const pairedFieldCount = fields.filter((field) => mappingForField(mappings, side, field)).length

  return (
    <section className={'data-panel data-panel--' + kind.toLowerCase()}>
      <div className="panel-heading">
        <div>
          <span className="source-label">{kind}</span>
          <h2>{format} response</h2>
        </div>
        <div className="panel-actions">
          <button className="secondary-button panel-parse-button" type="button" onClick={onParse}>
            <Play size={14} fill="currentColor" /> Parse {format}
          </button>
          <button
            className="icon-button"
            type="button"
            title={'Upload ' + format + ' file'}
            onClick={() => fileInput.current?.click()}
          >
            <Upload size={17} />
          </button>
          <input
            ref={fileInput}
            className="visually-hidden"
            type="file"
            accept={format === 'XML' ? '.xml,text/xml' : '.json,application/json'}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) readFile(file, onChange)
              event.target.value = ''
            }}
          />
        </div>
      </div>

      <textarea
        className="response-editor"
        aria-label={kind + ' ' + format + ' response'}
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />

      <div className="flatten-summary">
        <span>{isParsed ? 'Fully flattened' : 'Not parsed'}</span>
        <span>
          {isParsed ? rows.length + ' ' + (rows.length === 1 ? 'row' : 'rows') : '--'}
        </span>
      </div>

      <div className="preview">
        <div className="preview-title">
          <span>Preview</span>
          <div className="preview-heading-actions">
            <span>{isParsed ? fields.length + ' fields' : '--'}</span>
            <div className="view-toggle" role="group" aria-label="Preview orientation">
              <button
                className={'view-toggle-button ' + (!isPivoted ? 'is-active' : '')}
                type="button"
                title="Table view"
                disabled={!isParsed}
                aria-pressed={!isPivoted}
                onClick={() => setIsPivoted(false)}
              >
                <Table2 size={15} />
              </button>
              <button
                className={'view-toggle-button ' + (isPivoted ? 'is-active' : '')}
                type="button"
                title="Pivot view"
                disabled={!isParsed}
                aria-pressed={isPivoted}
                onClick={() => setIsPivoted(true)}
              >
                <Rows3 size={15} />
              </button>
            </div>
          </div>
        </div>
        {isParsed && isPivoted && (
          <div className="pairing-toolbar">
            <label className="preview-field-search">
              <Search size={14} aria-hidden="true" />
              <input
                type="search"
                value={fieldQuery}
                placeholder="Search fields"
                aria-label={'Search ' + kind + ' fields'}
                onChange={(event) => setFieldQuery(event.target.value)}
              />
            </label>
            <button
              className={'unpaired-filter' + (showUnpairedOnly ? ' is-active' : '')}
              type="button"
              aria-pressed={showUnpairedOnly}
              onClick={() => setShowUnpairedOnly((current) => !current)}
            >
              Unpaired only
            </button>
            <span>{pairedFieldCount} paired</span>
          </div>
        )}
        {isParsed ? (
          <div className="table-scroll">
            <table className={isPivoted ? 'pivot-table' : ''}>
              <thead>
                <tr>
                  {isPivoted && <th className="pair-column">Pair</th>}
                  {displayFields.map((field) => <th key={field}>{field}</th>)}
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row, index) => {
                  const path = isPivoted ? String(row.Field ?? '') : ''
                  const mapping = isPivoted ? mappingForField(mappings, side, path) : undefined
                  const pairNumber = mapping ? mappings.findIndex((candidate) => candidate.id === mapping.id) + 1 : 0
                  const isPending = pendingField?.side === side && pendingField.path === path
                  const isActive = Boolean(mapping && mapping.id === activePairId)
                  return (
                    <tr
                      className={(isPending ? 'is-pending-pair ' : '') + (isActive ? 'is-active-pair' : '')}
                      key={isPivoted ? path : index}
                    >
                      {isPivoted && (
                        <td className="pair-column">
                          {mapping ? (
                            <div className="pair-cell-actions">
                              <button
                                className="pair-badge"
                                type="button"
                                title={'Highlight Pair ' + pairNumber}
                                onClick={() => onSelectField(side, path)}
                              >
                                <Link2 size={12} /> {pairNumber}
                              </button>
                              <button
                                className="unlink-button"
                                type="button"
                                title={'Remove Pair ' + pairNumber}
                                aria-label={'Remove Pair ' + pairNumber}
                                onClick={() => onRemovePair(mapping.id)}
                              >
                                <Unlink size={13} />
                              </button>
                            </div>
                          ) : (
                            <button
                              className={'pair-field-button' + (isPending ? ' is-pending' : '')}
                              type="button"
                              title={isPending ? 'Cancel pending field' : 'Select field to pair'}
                              aria-label={(isPending ? 'Cancel ' : 'Select ') + path}
                              onClick={() => onSelectField(side, path)}
                            >
                              {isPending ? <Check size={14} /> : <Link2 size={14} />}
                            </button>
                          )}
                        </td>
                      )}
                      {displayFields.map((field) => (
                        <td key={field}>
                          {isPivoted && field === 'Field'
                            ? (
                              <button
                                className="preview-field-path"
                                type="button"
                                title={path}
                                onClick={() => onSelectField(side, path)}
                              >
                                {path}
                              </button>
                            )
                            : formatValue(row[field])}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {isPivoted && displayRows.length === 0 && (
              <div className="empty-state">No fields match this view</div>
            )}
          </div>
        ) : (
          <div className="unparsed-state">No parsed data</div>
        )}
      </div>
    </section>
  )
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('data')
  const [soapInput, setSoapInput] = useState(sampleSoap)
  const [restInput, setRestInput] = useState(sampleRest)
  const [soapRows, setSoapRows] = useState<FlatRow[]>([])
  const [restRows, setRestRows] = useState<FlatRow[]>([])
  const [soapParsed, setSoapParsed] = useState(false)
  const [restParsed, setRestParsed] = useState(false)
  const [mappings, setMappings] = useState<FieldMapping[]>(sampleMappings)
  const [mappingSource, setMappingSource] = useState<MappingSource>('sample')
  const [pendingField, setPendingField] = useState<FieldSelection | null>(null)
  const [activePairId, setActivePairId] = useState<string | null>(null)
  const [results, setResults] = useState<ComparisonResult[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [fieldStatusFilter, setFieldStatusFilter] = useState<FieldStatusFilter>('ALL')
  const [error, setError] = useState('')
  const configInput = useRef<HTMLInputElement>(null)
  const [soapFieldColumnWidth, setSoapFieldColumnWidth] = useState(DEFAULT_MAPPING_FIELD_WIDTH)
  const [restFieldColumnWidth, setRestFieldColumnWidth] = useState(DEFAULT_MAPPING_FIELD_WIDTH)
  const mappingColumnResize = useRef<MappingColumnResize | null>(null)
  const bothResponsesParsed = soapParsed && restParsed

  const soapFields = useMemo(() => collectFields(soapRows), [soapRows])
  const restFields = useMemo(() => collectFields(restRows), [restRows])
  const invalidMappings = useMemo(
    () => mappings.filter((mapping) => mapping.include && (
      !soapFields.includes(mapping.soapPath) || !restFields.includes(mapping.restPath)
    )),
    [mappings, restFields, soapFields],
  )

  const visibleResults = useMemo(
    () => results.filter((result) => result.status === 'MATCH' || result.status === 'MISMATCH'),
    [results],
  )

  const summary = useMemo(
    () => Object.fromEntries(visibleStatuses.map((status) => [
      status,
      visibleResults.filter((result) => result.status === status).length,
    ])) as Record<(typeof visibleStatuses)[number], number>,
    [visibleResults],
  )

  const filteredResults = useMemo(
    () => statusFilter === 'ALL'
      ? visibleResults
      : visibleResults.filter((result) => result.status === statusFilter),
    [statusFilter, visibleResults],
  )

  const visibleResultRows = useMemo<ResultTableRow[]>(() => filteredResults.flatMap<ResultTableRow>((result) => {
    const fields = fieldStatusFilter === 'ALL'
      ? result.fieldComparisons
      : result.fieldComparisons.filter((field) => field.status === 'MISMATCH')
    if (fields.length > 0) return fields.map((field) => ({ result, field }))
    return fieldStatusFilter === 'ALL' ? [{ result, field: undefined }] : []
  }), [fieldStatusFilter, filteredResults])

  function setMappingFieldColumnWidth(column: MappingFieldColumn, width: number): void {
    const nextWidth = clampMappingFieldWidth(width)
    if (column === 'soap') setSoapFieldColumnWidth(nextWidth)
    else setRestFieldColumnWidth(nextWidth)
  }

  function startMappingColumnResize(
    column: MappingFieldColumn,
    event: ReactPointerEvent<HTMLButtonElement>,
  ): void {
    event.preventDefault()
    mappingColumnResize.current = {
      column,
      startX: event.clientX,
      startWidth: column === 'soap' ? soapFieldColumnWidth : restFieldColumnWidth,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function resizeMappingColumn(event: ReactPointerEvent<HTMLButtonElement>): void {
    const resize = mappingColumnResize.current
    if (!resize) return
    setMappingFieldColumnWidth(resize.column, resize.startWidth + event.clientX - resize.startX)
  }

  function stopMappingColumnResize(event: ReactPointerEvent<HTMLButtonElement>): void {
    mappingColumnResize.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function resizeMappingColumnWithKeyboard(
    column: MappingFieldColumn,
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const currentWidth = column === 'soap' ? soapFieldColumnWidth : restFieldColumnWidth
    setMappingFieldColumnWidth(column, currentWidth + (event.key === 'ArrowRight' ? 24 : -24))
  }

  function updateSoapInput(value: string): void {
    setSoapInput(value)
    if (mappingSource === 'sample') {
      setMappings([])
      setMappingSource('manual')
    }
    setSoapRows([])
    setSoapParsed(false)
    setPendingField(null)
    setActivePairId(null)
    setResults([])
    setError('')
  }

  function updateRestInput(value: string): void {
    setRestInput(value)
    if (mappingSource === 'sample') {
      setMappings([])
      setMappingSource('manual')
    }
    setRestRows([])
    setRestParsed(false)
    setPendingField(null)
    setActivePairId(null)
    setResults([])
    setError('')
  }

  function parseSoapResponse(): void {
    try {
      setSoapRows(rowsFromDocument(parseXml(soapInput)))
      setSoapParsed(true)
      setResults([])
      setError('')
    } catch (parseError) {
      setSoapRows([])
      setSoapParsed(false)
      setError(parseError instanceof Error ? parseError.message : 'Unable to parse SOAP response.')
    }
  }

  function parseRestResponse(): void {
    try {
      setRestRows(rowsFromDocument(parseJson(restInput)))
      setRestParsed(true)
      setResults([])
      setError('')
    } catch (parseError) {
      setRestRows([])
      setRestParsed(false)
      setError(parseError instanceof Error ? parseError.message : 'Unable to parse REST response.')
    }
  }

  function updateMapping<K extends keyof FieldMapping>(
    id: string,
    property: K,
    value: FieldMapping[K],
  ): void {
    setMappingSource('manual')
    setMappings((current) => current.map((mapping) => {
      if (mapping.id !== id) return mapping
      const next = { ...mapping, [property]: value }
      if (property === 'include' && value === false) next.joinKey = false
      return next
    }))
    setResults([])
  }

  function selectPreviewField(side: MappingSide, path: string): void {
    const update = applyFieldSelection(
      mappings,
      pendingField,
      { side, path },
      crypto.randomUUID(),
    )
    setMappings(update.mappings)
    setPendingField(update.pending)
    setActivePairId(update.activePairId)
    if (update.created) setMappingSource('manual')
    setResults([])
  }

  function clearPairs(): void {
    setMappings([])
    setMappingSource('manual')
    setPendingField(null)
    setActivePairId(null)
    setResults([])
  }

  function addMapping(): void {
    setMappingSource('manual')
    setMappings((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        soapPath: soapFields[0] ?? '',
        restPath: restFields[0] ?? '',
        displayName: '',
        comparison: 'exact',
        include: true,
        joinKey: false,
      },
    ])
  }

  function removeMapping(id: string): void {
    setMappingSource('manual')
    setMappings((current) => current.filter((mapping) => mapping.id !== id))
    if (activePairId === id) setActivePairId(null)
    setResults([])
  }

  function runComparison(): void {
    try {
      if (invalidMappings.length > 0) {
        throw new Error('Resolve included fields marked as not found before running comparison.')
      }
      const nextResults = compareRows(soapRows, restRows, mappings)
      setResults(nextResults)
      setStatusFilter('ALL')
      setFieldStatusFilter('ALL')
      setError('')
      setActiveTab('results')
    } catch (comparisonError) {
      setError(comparisonError instanceof Error ? comparisonError.message : 'Unable to compare responses.')
    }
  }

  function exportConfig(): void {
    const config: ValidationConfig = {
      version: 2,
      mappings,
    }
    downloadFile('bridgecheck-config.json', JSON.stringify(config, null, 2), 'application/json')
  }

  function importConfig(file: File): void {
    readFile(file, (value) => {
      try {
        const config = JSON.parse(value) as ValidationConfig
        if ((config.version !== 1 && config.version !== 2) || !Array.isArray(config.mappings)) {
          throw new Error('Unsupported configuration file.')
        }
        setMappings(config.mappings)
        setMappingSource('imported')
        setPendingField(null)
        setActivePairId(null)
        setResults([])
        setError('')
      } catch (configError) {
        setError(configError instanceof Error ? configError.message : 'Unable to import configuration.')
      }
    })
  }

  function exportCsv(): void {
    const lines = [[
      'Key',
      'Record Status',
      'Field',
      'Field Status',
      'SOAP Value',
      'REST Value',
      'Comparison',
      'Match Key',
    ]]
    results.forEach((result) => {
      if (result.fieldComparisons.length === 0) {
        lines.push([formatKey(result.key), result.status, '', 'NOT_COMPARED', '', '', '', ''])
        return
      }
      result.fieldComparisons.forEach((field) => {
        lines.push([
          formatKey(result.key),
          result.status,
          field.field,
          field.status,
          formatValue(field.soapValue),
          formatValue(field.restValue),
          comparisonLabel(field.comparison),
          field.isMatchKey ? 'Yes' : 'No',
        ])
      })
    })
    const csv = lines
      .map((line) => line.map((cell) => '"' + cell.replaceAll('"', '""') + '"').join(','))
      .join('\n')
    downloadFile('bridgecheck-results.csv', csv, 'text/csv;charset=utf-8')
  }

  function resetSamples(): void {
    setSoapInput(sampleSoap)
    setRestInput(sampleRest)
    setSoapRows([])
    setRestRows([])
    setSoapParsed(false)
    setRestParsed(false)
    setMappings(sampleMappings)
    setMappingSource('sample')
    setPendingField(null)
    setActivePairId(null)
    setSoapFieldColumnWidth(DEFAULT_MAPPING_FIELD_WIDTH)
    setRestFieldColumnWidth(DEFAULT_MAPPING_FIELD_WIDTH)
    setResults([])
    setStatusFilter('ALL')
    setFieldStatusFilter('ALL')
    setError('')
    setActiveTab('data')
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark"><ArrowLeftRight size={19} /></div>
          <div className="brand-copy">
            <div className="brand-title">
              <strong>Bridgecheck</strong>
              <span className="version-badge">v{packageJson.version}</span>
            </div>
            <span className="brand-subtitle">SOAP to REST response validation</span>
          </div>
        </div>

        <div className="header-actions">
          <span className="local-badge"><ShieldCheck size={14} /> Local only</span>
          <button className="icon-button" type="button" title="Reset sample data" onClick={resetSamples}>
            <RotateCcw size={17} />
          </button>
          <button className="icon-button" type="button" title="Import configuration" onClick={() => configInput.current?.click()}>
            <FileUp size={17} />
          </button>
          <input
            ref={configInput}
            className="visually-hidden"
            type="file"
            accept=".json,application/json"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) importConfig(file)
              event.target.value = ''
            }}
          />
          <button className="secondary-button" type="button" onClick={exportConfig}>
            <FileJson size={16} /> Export config
          </button>
        </div>
      </header>

      <nav className="workflow-nav" aria-label="Validation workflow">
        {([
          ['data', '01', 'Data'],
          ['mapping', '02', 'Mapping'],
          ['results', '03', 'Results'],
        ] as const).map(([tab, number, label], index) => (
          <div className="workflow-item-wrap" key={tab}>
            <button
              className={'workflow-item ' + (activeTab === tab ? 'is-active' : '')}
              type="button"
              onClick={() => setActiveTab(tab)}
              disabled={tab !== 'data' && (!bothResponsesParsed || mappings.length === 0)}
            >
              <span>{number}</span>
              {label}
              {tab === 'results' && visibleResults.length > 0 && <b>{visibleResults.length}</b>}
            </button>
            {index < 2 && <ChevronRight className="workflow-arrow" size={16} />}
          </div>
        ))}
      </nav>

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Dismiss error">x</button>
        </div>
      )}

      <main>
        {activeTab === 'data' && (
          <div className="data-view">
            <div className="view-heading">
              <div>
                <span className="eyebrow">Source responses</span>
                <h1>Load response data</h1>
              </div>
              <button
                className="primary-button"
                type="button"
                disabled={!bothResponsesParsed || mappings.length === 0}
                onClick={() => setActiveTab('mapping')}
              >
                Review mappings <ChevronRight size={17} />
              </button>
            </div>
            <div className={'pairing-status' + (pendingField ? ' has-pending' : '')}>
              <div>
                <Link2 size={16} />
                {pendingField ? (
                  <span>
                    <b>{pendingField.side.toUpperCase()} selected:</b> {pendingField.path}
                    {' · Select a ' + (pendingField.side === 'soap' ? 'REST' : 'SOAP') + ' field'}
                  </span>
                ) : !bothResponsesParsed ? (
                  <span>Parse both responses to pair fields in the Pivot Previews.</span>
                ) : mappings.length > 0 ? (
                  <span><b>{mappings.length} field {mappings.length === 1 ? 'pair' : 'pairs'}</b> ready to review</span>
                ) : (
                  <span>Select a field in either Pivot Preview, then select its matching field.</span>
                )}
              </div>
              <div className="pairing-status-actions">
                {pendingField && (
                  <button
                    className="icon-button"
                    type="button"
                    title="Cancel pending field"
                    onClick={() => setPendingField(null)}
                  >
                    <X size={15} />
                  </button>
                )}
                {mappings.length > 0 && (
                  <button className="clear-pairs-button" type="button" onClick={clearPairs}>
                    Clear pairs
                  </button>
                )}
              </div>
            </div>
            <div className="data-grid">
              <DataPanel
                kind="SOAP"
                format="XML"
                value={soapInput}
                onChange={updateSoapInput}
                onParse={parseSoapResponse}
                rows={soapRows}
                isParsed={soapParsed}
                mappings={mappings}
                pendingField={pendingField}
                activePairId={activePairId}
                onSelectField={selectPreviewField}
                onRemovePair={removeMapping}
              />
              <DataPanel
                kind="REST"
                format="JSON"
                value={restInput}
                onChange={updateRestInput}
                onParse={parseRestResponse}
                rows={restRows}
                isParsed={restParsed}
                mappings={mappings}
                pendingField={pendingField}
                activePairId={activePairId}
                onSelectField={selectPreviewField}
                onRemovePair={removeMapping}
              />
            </div>
          </div>
        )}

        {activeTab === 'mapping' && (
          <div className="mapping-view">
            <div className="view-heading">
              <div>
                <span className="eyebrow">Field rules</span>
                <h1>Map fields for validation</h1>
              </div>
              <button className="primary-button" type="button" onClick={runComparison}>
                <Play size={16} fill="currentColor" /> Run comparison
              </button>
            </div>

            <div className="mapping-meta">
              <span><b>{soapRows.length}</b> SOAP rows</span>
              <span><b>{restRows.length}</b> REST rows</span>
              <span><b>{mappings.filter((mapping) => mapping.include).length}</b> included fields</span>
              <span><b>{mappings.filter((mapping) => mapping.include && mapping.joinKey).length}</b> join keys</span>
              {invalidMappings.length > 0 && (
                <span className="invalid-count"><b>{invalidMappings.length}</b> invalid mappings</span>
              )}
            </div>

            <div className="mapping-table-wrap">
              <table
                className="mapping-table"
                style={{
                  '--soap-field-width': soapFieldColumnWidth + 'px',
                  '--rest-field-width': restFieldColumnWidth + 'px',
                } as CSSProperties}
              >
                <thead>
                  <tr>
                    <th className="check-cell">Include</th>
                    <th className="resizable-field-column">
                      <span>SOAP Field</span>
                      <button
                        className="column-resize-handle"
                        type="button"
                        aria-label="Resize SOAP Field column"
                        title="Drag to resize; double-click to reset"
                        onPointerDown={(event) => startMappingColumnResize('soap', event)}
                        onPointerMove={resizeMappingColumn}
                        onPointerUp={stopMappingColumnResize}
                        onPointerCancel={stopMappingColumnResize}
                        onLostPointerCapture={stopMappingColumnResize}
                        onKeyDown={(event) => resizeMappingColumnWithKeyboard('soap', event)}
                        onDoubleClick={() => setSoapFieldColumnWidth(DEFAULT_MAPPING_FIELD_WIDTH)}
                      />
                    </th>
                    <th className="resizable-field-column">
                      <span>REST Field</span>
                      <button
                        className="column-resize-handle"
                        type="button"
                        aria-label="Resize REST Field column"
                        title="Drag to resize; double-click to reset"
                        onPointerDown={(event) => startMappingColumnResize('rest', event)}
                        onPointerMove={resizeMappingColumn}
                        onPointerUp={stopMappingColumnResize}
                        onPointerCancel={stopMappingColumnResize}
                        onLostPointerCapture={stopMappingColumnResize}
                        onKeyDown={(event) => resizeMappingColumnWithKeyboard('rest', event)}
                        onDoubleClick={() => setRestFieldColumnWidth(DEFAULT_MAPPING_FIELD_WIDTH)}
                      />
                    </th>
                    <th>Display Name</th>
                    <th>Comparison</th>
                    <th className="check-cell">Join Key</th>
                    <th className="action-cell"><span className="visually-hidden">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((mapping) => {
                    const soapFieldMissing = !soapFields.includes(mapping.soapPath)
                    const restFieldMissing = !restFields.includes(mapping.restPath)
                    return (
                    <tr className={mapping.include ? '' : 'is-disabled'} key={mapping.id}>
                      <td className="check-cell">
                        <input
                          type="checkbox"
                          aria-label={'Include ' + (mapping.displayName || mapping.soapPath)}
                          checked={mapping.include}
                          onChange={(event) => updateMapping(mapping.id, 'include', event.target.checked)}
                        />
                      </td>
                      <td>
                        <FieldSearch
                          label="SOAP field"
                          fields={soapFields}
                          value={mapping.soapPath}
                          invalid={soapFieldMissing}
                          onChange={(value) => updateMapping(mapping.id, 'soapPath', value)}
                        />
                        {soapFieldMissing && <span className="field-error">SOAP field not found</span>}
                      </td>
                      <td>
                        <FieldSearch
                          label="REST field"
                          fields={restFields}
                          value={mapping.restPath}
                          invalid={restFieldMissing}
                          onChange={(value) => updateMapping(mapping.id, 'restPath', value)}
                        />
                        {restFieldMissing && <span className="field-error">REST field not found</span>}
                      </td>
                      <td>
                        <input
                          type="text"
                          value={mapping.displayName}
                          placeholder={mapping.soapPath + ' / ' + mapping.restPath}
                          onChange={(event) => updateMapping(mapping.id, 'displayName', event.target.value)}
                        />
                      </td>
                      <td>
                        <select
                          value={mapping.comparison}
                          onChange={(event) => updateMapping(mapping.id, 'comparison', event.target.value as ComparisonMode)}
                        >
                          {comparisonOptions.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="check-cell">
                        <input
                          type="checkbox"
                          aria-label={'Use ' + (mapping.displayName || mapping.soapPath) + ' as Join Key'}
                          checked={mapping.joinKey}
                          disabled={!mapping.include}
                          onChange={(event) => updateMapping(mapping.id, 'joinKey', event.target.checked)}
                        />
                      </td>
                      <td className="action-cell">
                        <button
                          className="icon-button icon-button--danger"
                          type="button"
                          title="Remove mapping"
                          onClick={() => removeMapping(mapping.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
              {mappings.length === 0 && <div className="empty-state">No field mappings</div>}
            </div>

            <button className="add-button" type="button" onClick={addMapping}>
              <Plus size={16} /> Add field mapping
            </button>
          </div>
        )}

        {activeTab === 'results' && (
          <div className="results-view">
            <div className="view-heading">
              <div>
                <span className="eyebrow">Validation report</span>
                <h1>Comparison results</h1>
              </div>
              <div className="result-actions">
                <button className="secondary-button" type="button" onClick={() => setActiveTab('mapping')}>
                  Edit mapping
                </button>
                <button className="primary-button" type="button" disabled={results.length === 0} onClick={exportCsv}>
                  <Download size={16} /> Export CSV
                </button>
              </div>
            </div>

            {visibleResults.length === 0 ? (
              <div className="results-empty">
                <Check size={28} />
                <h2>No match or mismatch results</h2>
                <button className="primary-button" type="button" onClick={() => setActiveTab('mapping')}>Open mapping</button>
              </div>
            ) : (
              <>
                <div className="summary-grid">
                  <button className={'summary-item summary-item--total ' + (statusFilter === 'ALL' ? 'is-selected' : '')} onClick={() => setStatusFilter('ALL')}>
                    <span>Total</span><strong>{visibleResults.length}</strong>
                  </button>
                  {visibleStatuses.map((status) => (
                    <button
                      className={'summary-item status-' + status.toLowerCase() + ' ' + (statusFilter === status ? 'is-selected' : '')}
                      key={status}
                      onClick={() => setStatusFilter(status)}
                    >
                      <span>{status.replaceAll('_', ' ')}</span>
                      <strong>{summary[status]}</strong>
                    </button>
                  ))}
                </div>

                <div className="results-detail-toolbar">
                  <span>Field details</span>
                  <div className="result-field-filter" role="group" aria-label="Field result filter">
                    <button
                      className={fieldStatusFilter === 'ALL' ? 'is-active' : ''}
                      type="button"
                      aria-pressed={fieldStatusFilter === 'ALL'}
                      onClick={() => setFieldStatusFilter('ALL')}
                    >
                      All fields
                    </button>
                    <button
                      className={fieldStatusFilter === 'MISMATCH' ? 'is-active' : ''}
                      type="button"
                      aria-pressed={fieldStatusFilter === 'MISMATCH'}
                      onClick={() => setFieldStatusFilter('MISMATCH')}
                    >
                      Mismatches only
                    </button>
                  </div>
                </div>

                <div className="results-table-wrap">
                  <table className="results-table">
                    <thead>
                      <tr>
                        <th>Key</th>
                        <th>Field</th>
                        <th>Field Status</th>
                        <th>SOAP Value</th>
                        <th>REST Value</th>
                        <th>Comparison</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleResultRows.map(({ result, field }, index) => (
                        <tr
                          className={field?.status === 'MISMATCH' ? 'is-field-mismatch' : ''}
                          key={result.key + '-' + (field?.field ?? 'summary') + '-' + index}
                        >
                          <td className="key-value">{formatKey(result.key)}</td>
                          <td>
                            <span>{field?.field ?? '--'}</span>
                            {field?.isMatchKey && <span className="key-badge">Key</span>}
                          </td>
                          <td>
                            {field ? (
                              <span className={'field-status-pill status-' + field.status.toLowerCase()}>
                                {field.status.replaceAll('_', ' ')}
                              </span>
                            ) : '--'}
                          </td>
                          <td className="raw-value">{field ? formatValue(field.soapValue) : '--'}</td>
                          <td className="raw-value">{field ? formatValue(field.restValue) : '--'}</td>
                          <td>{field ? comparisonLabel(field.comparison) : '--'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {visibleResultRows.length === 0 && (
                    <div className="empty-state">No field details for this filter</div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

export default App
