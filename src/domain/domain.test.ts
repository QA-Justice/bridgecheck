import { describe, expect, it } from 'vitest'
import { compareRows } from './compare'
import {
  clampMappingFieldWidth,
  clampPreviewFieldWidth,
  clampPreviewValueWidth,
  clampResultColumnWidth,
} from './layout'
import { applyFieldSelection, suggestFieldPairs } from './pairing'
import { parseJson, parseXml } from './parse'
import { collectFields, filterFieldPaths, pivotRows, rowsFromDocument } from './rows'
import type { FieldMapping } from './types'
import { sampleMappings, sampleRest, sampleSoap } from '../samples'

describe('response parsing', () => {
  it('fully flattens a SOAP document with indexed repeated elements', () => {
    const rows = rowsFromDocument(parseXml(sampleSoap))

    expect(rows).toHaveLength(1)
    expect(rows[0]['Envelope.Body.GetCustomersResponse.Customers.Customer[0].CustomerNo']).toBe('1001')
    expect(rows[0]['Envelope.Body.GetCustomersResponse.Customers.Customer[2].Name']).toBe('Park')
    expect(rows[0]['Envelope.Body.GetCustomersResponse.Customers.Customer[0].Email']).toBeNull()
  })

  it('fully flattens nested REST objects and arrays', () => {
    const rows = rowsFromDocument(parseJson(sampleRest))
    const fields = collectFields(rows)

    expect(rows).toHaveLength(1)
    expect(fields).toContain('data.customers[0].account.balance')
    expect(rows[0]['data.customers[2].fullName']).toBe('Choi')
  })

  it('uses each top-level array item as a row', () => {
    const rows = rowsFromDocument(parseJson('[{"id":1,"tags":["a","b"]},{"id":2,"tags":[]}]'))

    expect(rows).toEqual([
      { id: 1, 'tags[0]': 'a', 'tags[1]': 'b' },
      { id: 2, tags: '[]' },
    ])
  })

  it('pivots fields into rows while preserving source values', () => {
    const pivoted = pivotRows([
      { id: 1, name: 'Kim', active: false },
      { id: 2, name: null },
    ])

    expect(pivoted).toEqual([
      { Field: 'id', 'Row 1': 1, 'Row 2': 2 },
      { Field: 'name', 'Row 1': 'Kim', 'Row 2': null },
      { Field: 'active', 'Row 1': false, 'Row 2': '' },
    ])
  })

  it('filters field paths by a case-insensitive partial match', () => {
    const fields = ['result.customer.id', 'result.customer.name', 'result.account.id']

    expect(filterFieldPaths(fields, 'CUSTOMER')).toEqual([
      'result.customer.id',
      'result.customer.name',
    ])
    expect(filterFieldPaths(fields, 'mer.na')).toEqual(['result.customer.name'])
    expect(filterFieldPaths(fields, '   ')).toEqual(fields)
  })

  it('preserves empty collections without exposing the XML parser text key', () => {
    const jsonRows = rowsFromDocument(parseJson('{"items":[],"metadata":{}}'))
    const xmlRows = rowsFromDocument(
      parseXml('<root><label>Prefix <strong>value</strong></label><code type="category">A</code></root>'),
    )

    expect(jsonRows[0]).toEqual({ items: '[]', metadata: '{}' })
    expect(xmlRows[0]).toEqual({ 'root.label.strong': 'value', 'root.code': 'A' })
    expect(collectFields(xmlRows).some((field) => field.includes('#text'))).toBe(false)
  })
})

describe('layout helpers', () => {
  it('clamps resizable mapping columns to usable bounds', () => {
    expect(clampMappingFieldWidth(100)).toBe(220)
    expect(clampMappingFieldWidth(480)).toBe(480)
    expect(clampMappingFieldWidth(1200)).toBe(900)
  })

  it('keeps result columns within usable resize limits', () => {
    expect(clampResultColumnWidth(40)).toBe(96)
    expect(clampResultColumnWidth(320)).toBe(320)
    expect(clampResultColumnWidth(1200)).toBe(900)
  })

  it('keeps pivot value columns within usable resize limits', () => {
    expect(clampPreviewValueWidth(40)).toBe(120)
    expect(clampPreviewValueWidth(360)).toBe(360)
    expect(clampPreviewValueWidth(1200)).toBe(900)
  })

  it('keeps the pivot field column within usable resize limits', () => {
    expect(clampPreviewFieldWidth(100)).toBe(220)
    expect(clampPreviewFieldWidth(420)).toBe(420)
    expect(clampPreviewFieldWidth(1200)).toBe(900)
  })
})

describe('preview field pairing', () => {
  it('creates a mapping only after one field from each response is selected', () => {
    const pending = applyFieldSelection([], null, { side: 'soap', path: 'customer.no' }, 'unused')
    const paired = applyFieldSelection(
      pending.mappings,
      pending.pending,
      { side: 'rest', path: 'customer.id' },
      'pair-1',
    )

    expect(pending.pending).toEqual({ side: 'soap', path: 'customer.no' })
    expect(pending.created).toBe(false)
    expect(paired.pending).toBeNull()
    expect(paired.created).toBe(true)
    expect(paired.mappings[0]).toMatchObject({
      id: 'pair-1',
      soapPath: 'customer.no',
      restPath: 'customer.id',
      include: true,
      comparison: 'exact',
    })
  })

  it('replaces a pending selection on the same side and activates existing pairs', () => {
    const replaced = applyFieldSelection(
      [],
      { side: 'soap', path: 'old.path' },
      { side: 'soap', path: 'new.path' },
      'unused',
    )
    const existing = applyFieldSelection(
      [{
        id: 'pair-1',
        soapPath: 'new.path',
        restPath: 'rest.path',
        displayName: '',
        comparison: 'exact',
        include: true,
        joinKey: false,
      }],
      null,
      { side: 'soap', path: 'new.path' },
      'unused',
    )

    expect(replaced.pending).toEqual({ side: 'soap', path: 'new.path' })
    expect(existing.activePairId).toBe('pair-1')
    expect(existing.created).toBe(false)
  })

  it('suggests unique unpaired fields from names, values, types, and array positions', () => {
    const soapRows = rowsFromDocument(parseXml(sampleSoap))
    const restRows = rowsFromDocument(parseJson(sampleRest))
    const suggestions = suggestFieldPairs(soapRows, restRows, sampleMappings)

    expect(suggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        soapPath: 'Envelope.Body.GetCustomersResponse.Customers.Customer[1].CustomerNo',
        restPath: 'data.customers[1].id',
      }),
      expect.objectContaining({
        soapPath: 'Envelope.Body.GetCustomersResponse.Customers.Customer[1].Balance',
        restPath: 'data.customers[1].account.balance',
      }),
    ]))
    expect(suggestions.every((suggestion) => suggestion.confidence >= 68)).toBe(true)
    expect(new Set(suggestions.map((suggestion) => suggestion.soapPath)).size).toBe(suggestions.length)
    expect(new Set(suggestions.map((suggestion) => suggestion.restPath)).size).toBe(suggestions.length)
  })

  it('does not suggest unrelated fields or reuse existing mapping paths', () => {
    const suggestions = suggestFieldPairs(
      [{ legacyCustomerNo: '1001', unrelatedFlag: true }],
      [{ customerId: 1001, description: 'ready' }],
      [{
        id: 'existing',
        soapPath: 'legacyCustomerNo',
        restPath: 'customerId',
        displayName: '',
        comparison: 'text',
        include: true,
        joinKey: false,
      }],
    )

    expect(suggestions).toEqual([])
  })

  it('suggests differently named fields when distinctive sample values match', () => {
    const suggestions = suggestFieldPairs(
      [{ legacyReference: 'A-901', legacyLabel: 'Seoul' }],
      [{ resourceCode: 'A-901', title: 'Seoul' }],
      [],
    )

    expect(suggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        soapPath: 'legacyReference',
        restPath: 'resourceCode',
      }),
      expect.objectContaining({
        soapPath: 'legacyLabel',
        restPath: 'title',
      }),
    ]))
  })

  it('does not recommend a pair from one short common value alone', () => {
    expect(suggestFieldPairs(
      [{ legacyFlag: 'A' }],
      [{ state: 'A' }],
      [],
    )).toEqual([])
  })
})

describe('comparison', () => {
  it('compares fields from fully flattened sample responses', () => {
    const soapRows = rowsFromDocument(parseXml(sampleSoap))
    const restRows = rowsFromDocument(parseJson(sampleRest))

    const [result] = compareRows(soapRows, restRows, sampleMappings)

    expect(result.status).toBe('MATCH')
    expect(result.fieldComparisons).toHaveLength(5)
    expect(result.fieldComparisons.every((field) => field.status === 'MATCH')).toBe(true)
    expect(result.fieldComparisons[0]).toMatchObject({
      soapValue: '1001',
      restValue: 1001,
      comparison: 'text',
      isMatchKey: true,
    })
  })

  it('reports matches, field mismatches, and side-only records', () => {
    const mappings: FieldMapping[] = [
      {
        id: 'id',
        soapPath: 'legacyId',
        restPath: 'id',
        displayName: 'Customer ID',
        comparison: 'text',
        include: true,
        joinKey: true,
      },
      {
        id: 'name',
        soapPath: 'legacyName',
        restPath: 'name',
        displayName: 'Customer name',
        comparison: 'exact',
        include: true,
        joinKey: false,
      },
    ]
    const results = compareRows(
      [
        { legacyId: '1', legacyName: 'Kim' },
        { legacyId: '2', legacyName: 'Lee' },
        { legacyId: '3', legacyName: 'Park' },
      ],
      [
        { id: 1, name: 'Kim' },
        { id: 2, name: 'Lee Min' },
        { id: 4, name: 'Choi' },
      ],
      mappings,
    )

    expect(results.map((result) => result.status)).toEqual([
      'MATCH',
      'MISMATCH',
      'SOAP_ONLY',
      'REST_ONLY',
    ])
    expect(results[0].fieldComparisons.every((field) => field.status === 'MATCH')).toBe(true)
    expect(results[1].fieldComparisons).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: 'Customer name',
        status: 'MISMATCH',
        soapValue: 'Lee',
        restValue: 'Lee Min',
      }),
    ]))
    expect(results[2].fieldComparisons.every((field) => field.status === 'NOT_COMPARED')).toBe(true)
  })

  it('compares one SOAP row with one REST row without a join key', () => {
    const mappings = sampleMappings.map((mapping) => ({ ...mapping, joinKey: false }))
    const [result] = compareRows(
      rowsFromDocument(parseXml(sampleSoap)),
      rowsFromDocument(parseJson(sampleRest)),
      mappings,
    )

    expect(result.key).toBe('Row 1')
    expect(result.status).toBe('MATCH')
    expect(result.fieldComparisons).toHaveLength(5)
  })

  it('rejects a comparison without a join key', () => {
    expect(() => compareRows([], [], sampleMappings.map((mapping) => ({ ...mapping, joinKey: false })))).toThrow(
      'Join Key',
    )
  })
})
