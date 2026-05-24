import type { DiscoveryData, GatewayConfig, ConnectionStatus } from './gateway-client'
import type { LobsterWorkflowFile } from '../types/lobster'

export type WorkflowReadinessStatus = 'ready' | 'warning' | 'blocked'

export interface WorkflowReadiness {
  status: WorkflowReadinessStatus
  requiredTools: string[]
  requiredChannels: string[]
  missingGatewayTools: string[]
  missingEffectiveTools: string[]
  missingChannels: string[]
  missingNativeRequirements: string[]
  messages: string[]
  blocksRun: boolean
}

function normalizeToolName(value: string): string {
  return value.trim()
}

function normalizeStaticValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isDynamicValue(value: string): boolean {
  return value.startsWith('$') || value.includes('${')
}

function isMessageSendAction(step: LobsterWorkflowFile['steps'][number]): boolean {
  const action = step.openclaw_action
  if (!action) return false
  return normalizeToolName(action.tool) === 'message' && (action.action ?? 'invoke').trim() === 'send'
}

function isLlmJsonTaskAction(step: LobsterWorkflowFile['steps'][number]): boolean {
  const action = step.openclaw_action
  if (!action) return false
  return normalizeToolName(action.tool) === 'llm-task' && (action.action ?? 'invoke').trim() === 'json'
}

function isRunAgentAction(step: LobsterWorkflowFile['steps'][number]): boolean {
  const action = step.openclaw_action
  if (!action) return false
  return normalizeToolName(action.tool) === 'sessions_spawn'
}

function isNodeInvokeAction(step: LobsterWorkflowFile['steps'][number]): boolean {
  const action = step.openclaw_action
  if (!action) return false
  return normalizeToolName(action.tool) === 'nodes' && (action.action ?? 'invoke').trim() === 'invoke'
}

function isJsonObjectValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true
  if (value && typeof value === 'object' && !Array.isArray(value)) return true
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed || isDynamicValue(trimmed)) return true
  try {
    const parsed = JSON.parse(trimmed)
    return Boolean(parsed && typeof parsed === 'object' && !Array.isArray(parsed))
  } catch {
    return false
  }
}

function usesInputAsMessage(step: LobsterWorkflowFile['steps'][number]): boolean {
  if (step.openclaw_action && 'each' in step.openclaw_action) {
    const action = step.openclaw_action as { each?: unknown; itemKey?: unknown }
    if (action.each === true && action.itemKey === 'message') return true
  }
  const pipeline = step.pipeline ?? ''
  return /\s--each(\s|$)/.test(pipeline) && /--item-key\s+['"]?message['"]?/.test(pipeline)
}

function sameGateway(left: GatewayConfig | null, right: GatewayConfig | null): boolean {
  if (!left || !right) return false
  if (left.id && right.id) return left.id === right.id
  return left.url.trim() === right.url.trim()
}

export function collectRequiredOpenClawTools(workflow: LobsterWorkflowFile): string[] {
  const tools = new Set<string>()

  for (const step of workflow.steps) {
    if (
      step.openclaw_workflow_ref ||
      step.openclaw_parallel_bundle ||
      step.pipeline?.trim().startsWith('lobster.workflow ') ||
      step.pipeline?.trim().startsWith('lobster.parallel ')
    ) {
      tools.add('lobster')
    }

    const action = step.openclaw_action
    if (!action) continue

    const required = Array.isArray(action.requiredTools) && action.requiredTools.length > 0
      ? action.requiredTools
      : ['lobster', action.tool]

    for (const tool of required) {
      const normalized = normalizeToolName(tool)
      if (normalized) tools.add(normalized)
    }
  }

  return [...tools].sort()
}

export function collectRequiredOpenClawChannels(workflow: LobsterWorkflowFile): string[] {
  const channels = new Set<string>()
  for (const step of workflow.steps) {
    if (!isMessageSendAction(step)) continue
    const args = step.openclaw_action?.args ?? {}
    const channel = normalizeStaticValue(args.provider ?? args.channel)
    if (channel && !isDynamicValue(channel)) channels.add(channel)
  }
  return [...channels].sort()
}

export function collectMissingOpenClawActionRequirements(workflow: LobsterWorkflowFile): string[] {
  const missing: string[] = []
  for (const step of workflow.steps) {
    if (isMessageSendAction(step)) {
      const args = step.openclaw_action?.args ?? {}
      const channel = normalizeStaticValue(args.provider ?? args.channel)
      const target = normalizeStaticValue(args.to ?? args.target)
      const message = normalizeStaticValue(args.message)
      if (!channel) missing.push(`${step.id}: choose a message channel.`)
      if (!target) missing.push(`${step.id}: enter a message target.`)
      if (!usesInputAsMessage(step) && !message) {
        missing.push(`${step.id}: enter a message body or map input as the message body.`)
      }
    }

    if (isLlmJsonTaskAction(step)) {
      const args = step.openclaw_action?.args ?? {}
      const prompt = normalizeStaticValue(args.prompt)
      if (!prompt) missing.push(`${step.id}: enter an LLM task prompt.`)
    }

    if (isRunAgentAction(step)) {
      const args = step.openclaw_action?.args ?? {}
      const task = normalizeStaticValue(args.task)
      if (!task) missing.push(`${step.id}: enter a Run Agent task.`)
    }

    if (isNodeInvokeAction(step)) {
      const args = step.openclaw_action?.args ?? {}
      const node = normalizeStaticValue(args.node)
      const command = normalizeStaticValue(args.invokeCommand)
      if (!node) missing.push(`${step.id}: choose a paired node.`)
      if (!command) missing.push(`${step.id}: enter a node command.`)
      if (!isJsonObjectValue(args.invokeParamsJson)) {
        missing.push(`${step.id}: enter Node Action params as a JSON object.`)
      }
    }
  }
  return missing
}

function hasExecutableParallelBundle(workflow: LobsterWorkflowFile): boolean {
  return workflow.steps.some((step) => (
    Boolean(step.openclaw_parallel_bundle?.branches.length) ||
    step.pipeline?.trim().startsWith('lobster.parallel ')
  ))
}

export function validateWorkflowReadiness(params: {
  workflow: LobsterWorkflowFile
  targetGateway: GatewayConfig | null
  activeGateway: GatewayConfig | null
  gatewayStatus: ConnectionStatus
  discovery: DiscoveryData | null
}): WorkflowReadiness {
  const requiredTools = collectRequiredOpenClawTools(params.workflow)
  const requiredChannels = collectRequiredOpenClawChannels(params.workflow)
  const missingNativeRequirements = collectMissingOpenClawActionRequirements(params.workflow)
  const messages: string[] = []
  if (requiredTools.length > 0) {
    messages.push(`Invoking agent must allow ${requiredTools.join(' + ')}.`)
  }

  if (params.workflow.openclaw?.bundle?.mode === 'parallel' && !hasExecutableParallelBundle(params.workflow)) {
    messages.push(
      'Add at least one published workflow ref before running or publishing parallel bundle mode.',
    )
    return {
      status: 'blocked',
      requiredTools,
      requiredChannels,
      missingGatewayTools: [],
      missingEffectiveTools: [],
      missingChannels: [],
      missingNativeRequirements,
      messages,
      blocksRun: true,
    }
  }

  if (missingNativeRequirements.length > 0) {
    messages.push(...missingNativeRequirements)
    return {
      status: 'blocked',
      requiredTools,
      requiredChannels,
      missingGatewayTools: [],
      missingEffectiveTools: [],
      missingChannels: [],
      missingNativeRequirements,
      messages,
      blocksRun: true,
    }
  }

  if (requiredTools.length === 0) {
    return {
      status: 'ready',
      requiredTools,
      requiredChannels,
      missingGatewayTools: [],
      missingEffectiveTools: [],
      missingChannels: [],
      missingNativeRequirements,
      messages: [],
      blocksRun: false,
    }
  }

  const discoveryForTarget =
    params.gatewayStatus === 'connected' &&
    sameGateway(params.targetGateway, params.activeGateway) &&
    params.discovery !== null
      ? params.discovery
      : null

  if (!discoveryForTarget) {
    messages.push('Connect the selected gateway to check its tool catalog before running.')
    return {
      status: 'warning',
      requiredTools,
      requiredChannels,
      missingGatewayTools: [],
      missingEffectiveTools: [],
      missingChannels: [],
      missingNativeRequirements,
      messages,
      blocksRun: false,
    }
  }

  const discoveredTools = new Set(discoveryForTarget.tools.map(normalizeToolName).filter(Boolean))
  if (discoveredTools.size === 0) {
    messages.push('Gateway tool catalog is empty or unavailable; tool presence cannot be verified.')
    return {
      status: 'warning',
      requiredTools,
      requiredChannels,
      missingGatewayTools: [],
      missingEffectiveTools: [],
      missingChannels: [],
      missingNativeRequirements,
      messages,
      blocksRun: false,
    }
  }

  const missingGatewayTools = requiredTools.filter((tool) => !discoveredTools.has(tool))
  if (missingGatewayTools.length > 0) {
    messages.push(`Missing from gateway tool catalog: ${missingGatewayTools.join(', ')}.`)
    return {
      status: 'blocked',
      requiredTools,
      requiredChannels,
      missingGatewayTools,
      missingEffectiveTools: [],
      missingChannels: [],
      missingNativeRequirements,
      messages,
      blocksRun: true,
    }
  }

  let channelDiscoveryUnavailable = false
  if (requiredChannels.length > 0) {
    if (discoveryForTarget.channelDiscoveryStatus === 'unavailable') {
      channelDiscoveryUnavailable = true
      messages.push('Gateway channel discovery is unavailable; channel targets cannot be verified.')
    } else {
      const discoveredChannels = new Map(
        discoveryForTarget.channels.map((channel) => [channel.id, channel]),
      )
      const missingChannels = requiredChannels.filter((channel) => {
        const discovered = discoveredChannels.get(channel)
        return !discovered || discovered.enabled === false
      })
      if (missingChannels.length > 0) {
        messages.push(`Unavailable gateway channel: ${missingChannels.join(', ')}.`)
        return {
          status: 'blocked',
          requiredTools,
          requiredChannels,
          missingGatewayTools: [],
          missingEffectiveTools: [],
          missingChannels,
          missingNativeRequirements,
          messages,
          blocksRun: true,
        }
      }
    }
  }

  const effectiveTools = discoveryForTarget.effectiveTools
  if (!effectiveTools) {
    messages.push('Gateway tool catalog includes every required tool; effective invoking-agent policy was not available.')
    return {
      status: 'warning',
      requiredTools,
      requiredChannels,
      missingGatewayTools: [],
      missingEffectiveTools: [],
      missingChannels: [],
      missingNativeRequirements,
      messages,
      blocksRun: false,
    }
  }

  const effectiveToolSet = new Set(effectiveTools.tools.map(normalizeToolName).filter(Boolean))
  const missingEffectiveTools = requiredTools.filter((tool) => !effectiveToolSet.has(tool))
  if (missingEffectiveTools.length > 0) {
    messages.push(
      `Invoking agent ${effectiveTools.agentId} is missing policy access: ${missingEffectiveTools.join(', ')}.`,
    )
    return {
      status: 'blocked',
      requiredTools,
      requiredChannels,
      missingGatewayTools: [],
      missingEffectiveTools,
      missingChannels: [],
      missingNativeRequirements,
      messages,
      blocksRun: true,
    }
  }

  messages.push(`Effective policy for agent ${effectiveTools.agentId} includes every required tool.`)
  return {
    status: channelDiscoveryUnavailable ? 'warning' : 'ready',
    requiredTools,
    requiredChannels,
    missingGatewayTools: [],
    missingEffectiveTools: [],
    missingChannels: [],
    missingNativeRequirements,
    messages,
    blocksRun: false,
  }
}
