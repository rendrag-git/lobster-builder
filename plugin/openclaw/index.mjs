import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry'
import {
  LOBSTER_BUILDER_PLUGIN_ROUTE,
  createLobsterBuilderHttpHandler,
} from './static-server.mjs'
import lobsterRuntimePlugin from './lobster-runtime.mjs'

export default definePluginEntry({
  id: 'lobster-builder',
  name: 'Lobster Builder',
  description: 'Serves the Lobster workflow builder and gateway-local Lobster runtime integration.',
  register(api) {
    lobsterRuntimePlugin.register(api)
    api.registerHttpRoute({
      path: LOBSTER_BUILDER_PLUGIN_ROUTE,
      auth: 'plugin',
      match: 'prefix',
      handler: createLobsterBuilderHttpHandler(),
    })
  },
})
