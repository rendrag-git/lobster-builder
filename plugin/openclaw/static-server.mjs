import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const LOBSTER_BUILDER_PLUGIN_ROUTE = '/plugins/lobster-builder'

const DEFAULT_RUNTIME_CONFIG = {
  id: 'openclaw-hosted',
  name: 'Hosting OpenClaw gateway',
  url: '',
  token: '',
  hosted: true,
  autoConnect: true,
  persist: false,
}

const CONTENT_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
])

function packageRootDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
}

function defaultDistDir() {
  return path.join(packageRootDir(), 'dist')
}

function routePrefix(routePath) {
  const normalized = routePath.trim().replace(/\/+$/, '')
  return normalized || LOBSTER_BUILDER_PLUGIN_ROUTE
}

function isWithinRoot(rootDir, candidate) {
  const relative = path.relative(rootDir, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function safeJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}

export function injectHostedGatewayConfig(html, config = DEFAULT_RUNTIME_CONFIG) {
  const script = `<script>window.__LOBSTER_BUILDER_GATEWAY__=${safeJson(config)};</script>`
  const headClose = html.toLowerCase().indexOf('</head>')
  if (headClose >= 0) {
    return `${html.slice(0, headClose)}${script}${html.slice(headClose)}`
  }
  return `${script}${html}`
}

function setSharedHeaders(res, contentType) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', contentType)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
}

function respondText(res, statusCode, body) {
  res.statusCode = statusCode
  setSharedHeaders(res, 'text/plain; charset=utf-8')
  res.end(body)
}

async function resolveAssetPath(rootDir, requestPath) {
  const root = path.resolve(rootDir)
  let decodedPath
  try {
    decodedPath = decodeURIComponent(requestPath)
  } catch {
    return { errorStatus: 400, errorBody: 'Bad Request' }
  }
  if (decodedPath.includes('\0')) {
    return { errorStatus: 400, errorBody: 'Bad Request' }
  }

  const relativePath = decodedPath.replace(/^\/+/, '') || 'index.html'
  let candidate = path.resolve(root, relativePath)
  if (!isWithinRoot(root, candidate)) {
    return { errorStatus: 404, errorBody: 'Not Found' }
  }

  try {
    const stat = await fs.stat(candidate)
    if (stat.isDirectory()) {
      candidate = path.join(candidate, 'index.html')
    }
  } catch {
    if (!path.extname(relativePath)) {
      candidate = path.join(root, 'index.html')
    }
  }

  if (!isWithinRoot(root, candidate)) {
    return { errorStatus: 404, errorBody: 'Not Found' }
  }
  return { filePath: candidate }
}

export function createLobsterBuilderHttpHandler(opts = {}) {
  const rootDir = path.resolve(opts.rootDir ?? defaultDistDir())
  const routePath = routePrefix(opts.routePath ?? LOBSTER_BUILDER_PLUGIN_ROUTE)
  const runtimeConfig = {
    ...DEFAULT_RUNTIME_CONFIG,
    ...(opts.runtimeConfig && typeof opts.runtimeConfig === 'object' ? opts.runtimeConfig : {}),
  }

  return async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname === routePath) {
      res.statusCode = 308
      res.setHeader('Location', `${routePath}/`)
      res.end()
      return true
    }
    if (!url.pathname.startsWith(`${routePath}/`)) {
      return false
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      respondText(res, 405, 'Method Not Allowed')
      return true
    }

    const assetPath = `/${url.pathname.slice(routePath.length + 1)}`
    const resolved = await resolveAssetPath(rootDir, assetPath)
    if (resolved.errorStatus) {
      respondText(res, resolved.errorStatus, resolved.errorBody)
      return true
    }

    try {
      const body = await fs.readFile(resolved.filePath)
      const ext = path.extname(resolved.filePath).toLowerCase()
      const contentType = CONTENT_TYPES.get(ext) ?? 'application/octet-stream'
      res.statusCode = 200
      setSharedHeaders(res, contentType)
      if (req.method === 'HEAD') {
        res.end()
        return true
      }
      if (ext === '.html') {
        res.end(injectHostedGatewayConfig(body.toString('utf8'), runtimeConfig))
        return true
      }
      res.end(body)
      return true
    } catch {
      respondText(res, 404, 'Not Found')
      return true
    }
  }
}
