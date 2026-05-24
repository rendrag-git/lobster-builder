/**
 * Types that mirror the Lobster .lobster YAML file format.
 */

export interface LobsterArgDef {
  default?: unknown
  description?: string
}

export type FlowRule =
  | { when: string; goto: string }
  | { default: string }

export interface LobsterStep {
  id: string
  command?: string
  run?: string
  pipeline?: string
  openclaw_action?: {
    tool: string
    action?: string
    args?: Record<string, unknown>
    requiredTools?: string[]
  }
  openclaw_workflow_ref?: {
    target?: 'file' | 'published'
    file?: string
    workflowId?: string
    workflowRevision?: number
    args?: Record<string, unknown>
    inputKey?: string
  }
  openclaw_parallel_bundle?: {
    wait?: 'all' | 'any'
    branches: Array<{
      id: string
      ref: string
      workflowId: string
      workflowRevision?: number
      pipeline: string
    }>
  }
  workflow?: string
  workflow_args?: Record<string, unknown>
  env?: Record<string, string>
  cwd?: string
  stdin?: unknown
  approval?: boolean | 'required'
  condition?: unknown
  when?: unknown
  parallel?: {
    wait?: 'all' | 'any'
    timeout_ms?: number
    branches: Array<{
      id: string
      run?: string
      command?: string
      pipeline?: string
      env?: Record<string, string>
      cwd?: string
      stdin?: unknown
    }>
  }
  for_each?: string
  item_var?: string
  index_var?: string
  batch_size?: number
  pause_ms?: number
  steps?: LobsterStep[]
  timeout_ms?: number
  on_error?: 'stop' | 'continue' | 'skip_rest'
  flow?: FlowRule[]
  max_iterations?: number
  retry?: {
    max?: number
    backoff?: 'fixed' | 'exponential'
    delay_ms?: number
    max_delay_ms?: number
    jitter?: boolean
  }
}

export interface OpenClawWorkflowMetadata {
  version: 1
  gateway?: {
    id?: string
    name?: string
    profile?: string
  }
  schedule?: {
    cron?: string
    timezone?: string
    enabled?: boolean
  }
  bundle?: {
    id?: string
    name?: string
    mode?: 'single' | 'chain' | 'parallel' | 'library'
    reusable?: boolean
    workflowRefs?: string[]
  }
}

export interface LobsterWorkflowFile {
  name?: string
  description?: string
  args?: Record<string, LobsterArgDef>
  env?: Record<string, string>
  cwd?: string
  openclaw?: OpenClawWorkflowMetadata
  steps: LobsterStep[]
}
