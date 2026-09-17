import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import packageJson from '../package.json'
import App from './App'

describe('App parsing workflow', () => {
  it('keeps the initial sample inputs unparsed', () => {
    const markup = renderToStaticMarkup(<App />)

    expect(markup).toContain('Not parsed')
    expect(markup).toContain('No parsed data')
    expect(markup).not.toContain('Fully flattened')
    expect(markup).toContain('Parse XML')
    expect(markup).toContain('Parse JSON')
    expect(markup).toContain('Review mappings')
    expect(markup).toContain('Parse both responses to pair fields in the Pivot Previews.')
    expect(markup).toContain('Config not imported')
    expect(markup).toContain('Not imported')
    expect(markup).toContain('v' + packageJson.version)
  })
})
