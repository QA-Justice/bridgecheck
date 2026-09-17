# Bridgecheck MVP Specification

Bridgecheck validates data parity while an API is migrated from SOAP/XML to REST/JSON. It runs entirely in the browser and never sends response data to a server.

## Data flow

- Initial sample text, pasted text, and uploaded files remain unparsed until that source's `Parse XML` or `Parse JSON` action is clicked.
- SOAP and REST parsing are independent; editing one source invalidates only that source's parsed rows and all previous comparison results.
- `Continue to mapping` performs no parsing and is enabled only after both sources parse successfully.

1. Parse XML or JSON into a nested JavaScript value.
2. Flatten every nested object and array into leaf-value paths.
3. Use each top-level array item as a row; use a top-level object as one row.
4. Map SOAP fields to REST fields and optionally assign a display name.
5. Apply explicit comparison modes and join rows by one or more selected keys.
6. Report every enabled field with record-level and field-level status.

## Flattening rules

- Nested objects use dot notation: `customer.address.city`.
- Nested arrays use index notation: `contacts[0].value`.
- Empty arrays and objects are preserved as `[]` and `{}`.
- Original property order is preserved.
- SOAP namespace prefixes are removed.
- SOAP attributes are ignored except `xsi:nil`, which becomes `null`.
- XML parser internals such as `#text` are never exposed as fields.
- SOAP wrappers remain visible in field paths, including `Envelope.Body`.
- No row-root or records-path selection is required.

## Preview rules

- Table view shows source rows horizontally and flattened fields as columns.
- Pivot view shows flattened fields as rows and source records as `Row 1`, `Row 2`, and so on.
- Long pivot field paths remain fully visible and expand the table into horizontal scrolling.
- Pivot Previews open by default and support field search plus an unpaired-only filter.
- Selecting one SOAP field and one REST field creates one explicit mapping pair; fields are never paired by bulk selection order.
- Re-parsing preserves existing pairs and missing paths are reported in Mapping instead of being silently removed.
- Preview orientation is independent for the SOAP and REST responses and does not change comparison behavior.

## Comparison rules

- One SOAP row and one REST row are compared directly without requiring a join key.
- Multiple rows require one or more join keys and use full-outer-join semantics.
- `Exact` is the default and preserves source types.
- Dates are never normalized automatically; their original representation is part of the response contract.
- Original SOAP and REST values are preserved in reports even when another comparison mode is applied.
- Missing values, `null`, empty strings, and empty collections remain distinct.
- Duplicate and incomplete join keys are reported instead of compared.

## Mapping rules

- SOAP and REST field columns can be resized independently by dragging their header boundaries.
- Resized mapping tables use horizontal scrolling instead of compressing long field paths.
- SOAP and REST field selectors support case-insensitive partial-path search and commit only a selected result.
- Bundled sample mappings are used only with the bundled sample responses.
- Editing either response for the first time removes sample mappings.
- Manual and imported mappings remain unchanged when response text is edited or parsed again.
- SOAP and REST field selectors list only fields found in the currently parsed responses.
- A preserved manual or imported path that is absent from the current response is marked as not found; included mappings must be resolved before comparison.
- `Suggest pairs` considers only currently unpaired parsed fields and returns one-to-one candidates above a conservative confidence threshold.
- Suggestions show their confidence and scoring reasons but do not affect comparison or exported config until individually accepted.
- Accepted suggestions become ordinary mappings with `Exact` comparison and never select a Join Key automatically.
- Manual and imported mappings are never replaced by suggestions.

## Result details

- Every enabled mapping is retained, including matching fields and match-key fields.
- Displayed SOAP and REST values preserve their original representation.
- The Results screen summary, filters, and detail table include only `MATCH` and `MISMATCH` records.
- The default view shows all fields; `Mismatches only` filters the screen without changing CSV output.
- CSV export contains every field result and record-status diagnostic, regardless of active screen filters.

## Comparison statuses

- `MATCH`: every enabled field is equivalent after applying its comparison mode.
- `MISMATCH`: at least one included field differs.
- `SOAP_ONLY`: the key occurs only in the SOAP response; retained for CSV diagnostics.
- `REST_ONLY`: the key occurs only in the REST response; retained for CSV diagnostics.
- `DUPLICATE_KEY`: the key occurs more than once on either side; retained for CSV diagnostics.
- `INCOMPLETE_KEY`: at least one join-key value is missing; retained for CSV diagnostics.

## Explicit non-goals for MVP

- Calling live APIs, handling authentication, or bypassing CORS
- Parsing WSDL or OpenAPI documents
- AI/LLM-based mapping or automatically accepting suggested pairs
- Streaming multi-gigabyte files
- Server-side storage, accounts, or collaboration

## Module boundaries

- `parse.ts`: format parsing and XML-specific value cleanup
- `rows.ts`: deterministic full-response flattening
- `pairing.ts`: manual preview pairing and deterministic pair suggestions
- `compare.ts`: field mapping, comparison modes, joining, and reporting
- `App.tsx`: workflow state and presentation only
