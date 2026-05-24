import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  LOBSTER_BUILDER_PLUGIN_ROUTE,
  createLobsterBuilderHttpHandler,
  injectHostedGatewayConfig,
} from './static-server.mjs'

const tempDirs = []

async function makeTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lobster-builder-plugin-'))
  tempDirs.push(dir)
  return dir
}

function createResponse() {
  return {
    statusCode: 200,
    headers: new Map(),
    body: undefined,
    setHeader(name, value) {
      this.headers.set(name.toLowerCase(), value)
    },
    end(chunk) {
      this.body = chunk
    },
  }
}

function createRequest(url, method = 'GET') {
  return { url, method }
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    await fs.rm(dir, { recursive: true, force: true })
  }
})

describe('OpenClaw Lobster Builder plugin static server', () => {
  it('injects hosted same-origin gateway config into HTML', () => {
    const html = '<!doctype html><html><head></head><body></body></html>'

    const injected = injectHostedGatewayConfig(html, {
      id: 'hosted',
      name: '<host>',
      url: '',
      token: '',
      hosted: true,
      autoConnect: true,
      persist: false,
    })

    expect(injected).toContain('window.__LOBSTER_BUILDER_GATEWAY__=')
    expect(injected).toContain('\\u003chost>')
    expect(injected.indexOf('window.__LOBSTER_BUILDER_GATEWAY__')).toBeLessThan(
      injected.indexOf('</head>'),
    )
  })

  it('redirects the plugin route to a trailing slash', async () => {
    const handler = createLobsterBuilderHttpHandler({ rootDir: await makeTempDir() })
    const res = createResponse()

    const handled = await handler(createRequest(LOBSTER_BUILDER_PLUGIN_ROUTE), res)

    expect(handled).toBe(true)
    expect(res.statusCode).toBe(308)
    expect(res.headers.get('location')).toBe(`${LOBSTER_BUILDER_PLUGIN_ROUTE}/`)
  })

  it('serves built assets from the plugin route prefix', async () => {
    const rootDir = await makeTempDir()
    await fs.mkdir(path.join(rootDir, 'assets'), { recursive: true })
    await fs.writeFile(
      path.join(rootDir, 'index.html'),
      '<!doctype html><html><head></head><body><div id="root"></div></body></html>',
      'utf8',
    )
    await fs.writeFile(path.join(rootDir, 'assets', 'app.js'), 'console.log("ok")', 'utf8')
    const handler = createLobsterBuilderHttpHandler({ rootDir })

    const htmlRes = createResponse()
    const htmlHandled = await handler(createRequest(`${LOBSTER_BUILDER_PLUGIN_ROUTE}/`), htmlRes)
    expect(htmlHandled).toBe(true)
    expect(htmlRes.statusCode).toBe(200)
    expect(htmlRes.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(String(htmlRes.body)).toContain('window.__LOBSTER_BUILDER_GATEWAY__=')

    const assetRes = createResponse()
    const assetHandled = await handler(
      createRequest(`${LOBSTER_BUILDER_PLUGIN_ROUTE}/assets/app.js`),
      assetRes,
    )
    expect(assetHandled).toBe(true)
    expect(assetRes.statusCode).toBe(200)
    expect(assetRes.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    expect(String(assetRes.body)).toBe('console.log("ok")')
  })

  it('does not serve files outside the configured asset root', async () => {
    const rootDir = await makeTempDir()
    await fs.writeFile(path.join(rootDir, 'index.html'), '<!doctype html>', 'utf8')
    const handler = createLobsterBuilderHttpHandler({ rootDir })
    const res = createResponse()

    const handled = await handler(
      createRequest(`${LOBSTER_BUILDER_PLUGIN_ROUTE}/%2e%2e%2fpackage.json`),
      res,
    )

    expect(handled).toBe(true)
    expect(res.statusCode).toBe(404)
  })
})
