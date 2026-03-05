import type { Node, Edge } from '@xyflow/react'

/** Data stored on each React Flow node */
export interface WorkflowNodeData {
  actionId: string
  config: Record<string, unknown>
  label?: string
  [key: string]: unknown
}

/** Typed React Flow node for our workflow */
export type WorkflowNode = Node<WorkflowNodeData>

/** Typed React Flow edge for our workflow */
export type WorkflowEdge = Edge

export interface WorkflowMeta {
  name: string
  description?: string
  args?: Record<string, { default?: unknown; description?: string }>
  env?: Record<string, string>
  cwd?: string
}
