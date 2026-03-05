import type { LobsterStep } from './lobster'

export type ActionCategory = 'ai' | 'flow' | 'data' | 'io' | 'meta'

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
  /** Whether this field is required */
  required?: boolean
}

export interface CompileContext {
  nodeId: string
  incomingEdges: Array<{
    sourceNodeId: string
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
  inputs: PortDefinition[]
  outputs: PortDefinition[]
  configFields: ConfigField[]
  defaults: Record<string, unknown>
  compile: (
    config: Record<string, unknown>,
    context: CompileContext
  ) => LobsterStep[]
}
