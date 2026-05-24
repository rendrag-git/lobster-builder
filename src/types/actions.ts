import type { LobsterStep } from './lobster'

export type ActionCategory = 'ai' | 'flow' | 'data' | 'io' | 'openclaw' | 'meta'

export type PortKind = 'data' | 'trigger' | 'text' | 'any' | 'json'

export interface PortDefinition {
  id: string
  label: string
  kind: PortKind
}

export type ConfigFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'select'
  | 'code'

export interface ConfigFieldOption {
  value: string
  label: string
}

export interface ConfigField {
  id: string
  label: string
  type: ConfigFieldType
  placeholder?: string
  defaultValue?: unknown
  options?: ConfigFieldOption[]
  /** Help text shown below the field */
  description?: string
  /** Whether this field is required */
  required?: boolean
  /** When set, populates options from live Gateway discovery data */
  gatewaySource?: 'agents' | 'models' | 'channels' | 'skills' | 'tools' | 'nodes'
}

export interface CompileContext {
  nodeId: string
  incomingEdges: Array<{
    sourceNodeId: string
    sourcePortId: string
    targetPortId: string
  }>
  outgoingEdges: Array<{
    targetNodeId: string
    sourcePortId: string
    targetPortId: string
  }>
}

export interface ActionDefinition {
  id: string
  name: string
  category: ActionCategory
  icon: string
  description: string
  requiredTools?: string[]
  inputs: PortDefinition[]
  outputs: PortDefinition[]
  configFields: ConfigField[]
  defaults: Record<string, unknown>
  compile: (
    config: Record<string, unknown>,
    context: CompileContext
  ) => LobsterStep[]
}
