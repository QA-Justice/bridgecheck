# Bridgecheck

Bridgecheck validates data parity while an API is migrated from SOAP/XML to REST/JSON. Everything runs locally in the browser.

Current MVP version: `0.5.1`.

## Features

- Paste or upload SOAP/XML and REST/JSON responses
- Parse SOAP and REST responses independently with explicit panel actions
- Fully flatten nested objects and arrays without manual path selection
- Use dot notation for objects and index notation for arrays
- Pivot wide previews so fields become rows, with horizontal scrolling for long paths
- Resize SOAP and REST mapping columns by dragging their header boundaries
- Search SOAP and REST field paths by case-insensitive partial text
- Pair SOAP and REST fields directly from searchable Pivot Previews
- Generate reviewable one-to-one pair suggestions from field names, paths, sample values, and types
- Map fields and choose explicit comparison modes
- Keep manual and imported mappings across response edits while sample mappings stay sample-only
- Flag mapped fields that do not exist in the parsed responses
- Match records with single or composite join keys
- Show every enabled field with field-level status and record summaries
- Truncate long result values with hover details and resizable result columns
- Show match and mismatch records in the Results screen
- Filter result details to mismatches without hiding matches from CSV exports
- Export every field result and record-status diagnostic as CSV
- Import and export reusable mapping configuration
- Show imported configuration filename and modification status in the app header

## Development

~~~bash
npm install
npm run dev
~~~

## Standalone HTML

Build a single offline file containing the application, JavaScript, and CSS:

~~~bash
npm run build:standalone
~~~

Open `bridgecheck.html` directly in a modern browser. No server or internet connection is required.

## Verification

~~~bash
npm test
npm run lint
npm run build
~~~

## GitHub Pages

The included workflow builds and deploys the `dist` directory on pushes to `main`. In the repository settings, set Pages source to **GitHub Actions**.

See [docs/spec.md](docs/spec.md) for comparison rules and MVP boundaries.
