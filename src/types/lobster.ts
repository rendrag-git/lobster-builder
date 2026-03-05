/**
 * Types that mirror the Lobster .lobster YAML file format.
 */

export interface LobsterArgDef {
  default?: unknown
  description?: string
}

export interface LobsterStep {
  id: string
  command: string
  env?: Record<string, string>
  cwd?: string
  stdin?: string
  approval?: boolean | 'required'
  condition?: string
  when?: string
}

export interface LobsterWorkflowFile {
  name?: string
  description?: string
  args?: Record<string, LobsterArgDef>
  env?: Record<string, string>
  cwd?: string
  steps: LobsterStep[]
}
