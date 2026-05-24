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

export interface WorkflowGatewayTarget {
  id?: string
  name?: string
  profile?: string
}

export interface WorkflowSchedule {
  cron?: string
  timezone?: string
  enabled?: boolean
  jobId?: string
}

export type WorkflowBundleMode = 'single' | 'chain' | 'parallel' | 'library'

export interface WorkflowBundleMeta {
  id?: string
  name?: string
  mode?: WorkflowBundleMode
  reusable?: boolean
  workflowRefs?: string[]
}

export interface WorkflowMeta {
  name: string
  description?: string
  args?: Record<string, { default?: unknown; description?: string }>
  env?: Record<string, string>
  cwd?: string
  gateway?: WorkflowGatewayTarget
  schedule?: WorkflowSchedule
  bundle?: WorkflowBundleMeta
}
