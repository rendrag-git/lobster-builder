import { describe, expect, it } from 'vitest'
import {
  collectRequiredOpenClawTools,
  validateWorkflowReadiness,
} from '../lib/workflow-readiness'
import type { DiscoveryData, GatewayConfig } from '../lib/gateway-client'
import type { LobsterWorkflowFile } from '../types/lobster'

const gateway: GatewayConfig = { id: 'home', name: 'Home', url: '', token: 'token' }

const baseDiscovery: DiscoveryData = {
  agents: [],
  models: [],
  channels: [{ id: 'discord', enabled: true, type: 'discord' }],
  channelDiscoveryStatus: 'available',
  skills: [],
  tools: ['lobster', 'message', 'llm-task', 'sessions_spawn', 'nodes'],
  nodes: [{ id: 'macbook', name: 'MacBook', connected: true, commands: ['device.status'] }],
  effectiveTools: null,
}

function workflow(
  requiredTools: string[],
  args: Record<string, unknown> = { provider: 'discord', to: 'ops', message: 'done' },
): LobsterWorkflowFile {
  return {
    name: 'ready',
    steps: [
      {
        id: 'notify',
        pipeline: 'openclaw.invoke --tool message --action send --args-json {}',
        openclaw_action: {
          tool: 'message',
          action: 'send',
          args,
          requiredTools,
        },
      },
    ],
  }
}

function llmTaskWorkflow(
  args: Record<string, unknown> = { prompt: 'Return JSON.' },
): LobsterWorkflowFile {
  return {
    name: 'llm-task-ready',
    steps: [
      {
        id: 'classify',
        pipeline: 'openclaw.invoke --tool llm-task --action json --args-json {}',
        openclaw_action: {
          tool: 'llm-task',
          action: 'json',
          args,
          requiredTools: ['lobster', 'llm-task'],
        },
      },
    ],
  }
}

function runAgentWorkflow(
  args: Record<string, unknown> = { task: 'Investigate the customer record.' },
): LobsterWorkflowFile {
  return {
    name: 'run-agent-ready',
    steps: [
      {
        id: 'delegate',
        pipeline: 'openclaw.invoke --tool sessions_spawn --action spawn --args-json {}',
        openclaw_action: {
          tool: 'sessions_spawn',
          action: 'spawn',
          args,
          requiredTools: ['lobster', 'sessions_spawn'],
        },
      },
    ],
  }
}

function nodeActionWorkflow(
  args: Record<string, unknown> = {
    node: 'macbook',
    invokeCommand: 'device.status',
    invokeParamsJson: '{"includeBattery":true}',
  },
): LobsterWorkflowFile {
  return {
    name: 'node-action-ready',
    steps: [
      {
        id: 'node-status',
        pipeline: 'openclaw.invoke --tool nodes --action invoke --args-json {}',
        openclaw_action: {
          tool: 'nodes',
          action: 'invoke',
          args,
          requiredTools: ['lobster', 'nodes'],
        },
      },
    ],
  }
}

describe('workflow readiness', () => {
  it('collects required OpenClaw tools from native action metadata', () => {
    expect(collectRequiredOpenClawTools(workflow(['message', 'lobster', 'message']))).toEqual([
      'lobster',
      'message',
    ])
  })

  it('blocks when connected gateway discovery proves a required tool is missing', () => {
    const readiness = validateWorkflowReadiness({
      workflow: workflow(['lobster', 'message', 'nodes']),
      targetGateway: gateway,
      activeGateway: gateway,
      gatewayStatus: 'connected',
      discovery: {
        ...baseDiscovery,
        tools: baseDiscovery.tools.filter((tool) => tool !== 'nodes'),
      },
    })

    expect(readiness.status).toBe('blocked')
    expect(readiness.blocksRun).toBe(true)
    expect(readiness.missingGatewayTools).toEqual(['nodes'])
    expect(readiness.messages.join('\n')).toContain('Missing from gateway tool catalog: nodes.')
  })

  it('blocks message sends that are missing required message fields', () => {
    const readiness = validateWorkflowReadiness({
      workflow: workflow(['lobster', 'message'], { provider: 'discord', to: 'ops', message: '' }),
      targetGateway: gateway,
      activeGateway: gateway,
      gatewayStatus: 'connected',
      discovery: baseDiscovery,
    })

    expect(readiness.status).toBe('blocked')
    expect(readiness.blocksRun).toBe(true)
    expect(readiness.missingNativeRequirements).toEqual([
      'notify: enter a message body or map input as the message body.',
    ])
  })

  it('blocks LLM JSON Task actions that are missing a prompt', () => {
    const readiness = validateWorkflowReadiness({
      workflow: llmTaskWorkflow({ prompt: '' }),
      targetGateway: gateway,
      activeGateway: gateway,
      gatewayStatus: 'connected',
      discovery: baseDiscovery,
    })

    expect(readiness.status).toBe('blocked')
    expect(readiness.blocksRun).toBe(true)
    expect(readiness.missingNativeRequirements).toEqual([
      'classify: enter an LLM task prompt.',
    ])
  })

  it('blocks LLM JSON Task when connected gateway discovery proves llm-task is missing', () => {
    const readiness = validateWorkflowReadiness({
      workflow: llmTaskWorkflow(),
      targetGateway: gateway,
      activeGateway: gateway,
      gatewayStatus: 'connected',
      discovery: {
        ...baseDiscovery,
        tools: ['lobster', 'message'],
      },
    })

    expect(readiness.status).toBe('blocked')
    expect(readiness.blocksRun).toBe(true)
    expect(readiness.requiredTools).toEqual(['llm-task', 'lobster'])
    expect(readiness.missingGatewayTools).toEqual(['llm-task'])
    expect(readiness.messages.join('\n')).toContain('Missing from gateway tool catalog: llm-task.')
  })

  it('blocks Run Agent actions that are missing a task', () => {
    const readiness = validateWorkflowReadiness({
      workflow: runAgentWorkflow({ task: '' }),
      targetGateway: gateway,
      activeGateway: gateway,
      gatewayStatus: 'connected',
      discovery: baseDiscovery,
    })

    expect(readiness.status).toBe('blocked')
    expect(readiness.blocksRun).toBe(true)
    expect(readiness.missingNativeRequirements).toEqual([
      'delegate: enter a Run Agent task.',
    ])
  })

  it('blocks Run Agent when connected gateway discovery proves sessions_spawn is missing', () => {
    const readiness = validateWorkflowReadiness({
      workflow: runAgentWorkflow(),
      targetGateway: gateway,
      activeGateway: gateway,
      gatewayStatus: 'connected',
      discovery: {
        ...baseDiscovery,
        tools: ['lobster', 'message', 'llm-task'],
      },
    })

    expect(readiness.status).toBe('blocked')
    expect(readiness.blocksRun).toBe(true)
    expect(readiness.requiredTools).toEqual(['lobster', 'sessions_spawn'])
    expect(readiness.missingGatewayTools).toEqual(['sessions_spawn'])
    expect(readiness.messages.join('\n')).toContain('Missing from gateway tool catalog: sessions_spawn.')
  })

  it('blocks when connected gateway discovery proves a selected channel is unavailable', () => {
    const readiness = validateWorkflowReadiness({
      workflow: workflow(['lobster', 'message']),
      targetGateway: gateway,
      activeGateway: gateway,
      gatewayStatus: 'connected',
      discovery: {
        ...baseDiscovery,
        channels: [],
        channelDiscoveryStatus: 'available',
      },
    })

    expect(readiness.status).toBe('blocked')
    expect(readiness.blocksRun).toBe(true)
    expect(readiness.missingChannels).toEqual(['discord'])
    expect(readiness.messages.join('\n')).toContain('Unavailable gateway channel: discord.')
  })

  it('warns without blocking when channel discovery fails and manual fallback is in use', () => {
    const readiness = validateWorkflowReadiness({
      workflow: workflow(['lobster', 'message']),
      targetGateway: gateway,
      activeGateway: gateway,
      gatewayStatus: 'connected',
      discovery: {
        ...baseDiscovery,
        channels: [],
        channelDiscoveryStatus: 'unavailable',
        effectiveTools: {
          agentId: 'main',
          sessionKey: 'agent:main:main',
          tools: ['lobster', 'message'],
        },
      },
    })

    expect(readiness.status).toBe('warning')
    expect(readiness.blocksRun).toBe(false)
    expect(readiness.messages.join('\n')).toContain('Gateway channel discovery is unavailable')
  })

  it('warns instead of blocking when discovery is unavailable for the target gateway', () => {
    const readiness = validateWorkflowReadiness({
      workflow: workflow(['lobster', 'message']),
      targetGateway: { ...gateway, id: 'other', url: 'http://other:18789' },
      activeGateway: gateway,
      gatewayStatus: 'connected',
      discovery: baseDiscovery,
    })

    expect(readiness.status).toBe('warning')
    expect(readiness.blocksRun).toBe(false)
    expect(readiness.messages.join('\n')).toContain('Connect the selected gateway')
  })

  it('blocks parallel bundle metadata that has no executable fan-out step', () => {
    const readiness = validateWorkflowReadiness({
      workflow: {
        name: 'parallel bundle',
        openclaw: {
          version: 1,
          bundle: {
            mode: 'parallel',
            workflowRefs: ['child-a@1', 'child-b@1'],
          },
        },
        steps: [
          {
            id: 'noop',
            command: 'echo ok',
          },
        ],
      },
      targetGateway: gateway,
      activeGateway: gateway,
      gatewayStatus: 'connected',
      discovery: baseDiscovery,
    })

    expect(readiness.status).toBe('blocked')
    expect(readiness.blocksRun).toBe(true)
    expect(readiness.requiredTools).toEqual([])
    expect(readiness.messages.join('\n')).toContain('Add at least one published workflow ref')
  })

  it('allows executable parallel bundle steps through normal tool readiness', () => {
    const readiness = validateWorkflowReadiness({
      workflow: {
        name: 'parallel bundle',
        openclaw: {
          version: 1,
          bundle: {
            mode: 'parallel',
            workflowRefs: ['child-a@1', 'child-b@1'],
          },
        },
        steps: [
          {
            id: 'openclaw_parallel_bundle',
            pipeline: 'lobster.parallel --branches-json []',
            openclaw_parallel_bundle: {
              wait: 'all',
              branches: [
                {
                  id: 'child-a',
                  ref: 'child-a@1',
                  workflowId: 'child-a',
                  workflowRevision: 1,
                  pipeline: "lobster.workflow --workflow-id 'child-a' --workflow-revision '1'",
                },
              ],
            },
          },
        ],
      },
      targetGateway: gateway,
      activeGateway: gateway,
      gatewayStatus: 'connected',
      discovery: baseDiscovery,
    })

    expect(readiness.status).toBe('warning')
    expect(readiness.blocksRun).toBe(false)
    expect(readiness.requiredTools).toEqual(['lobster'])
    expect(readiness.messages.join('\n')).toContain('effective invoking-agent policy was not available')
  })

  it('warns when discovered tools include every requirement but effective policy is unavailable', () => {
    const readiness = validateWorkflowReadiness({
      workflow: workflow(['lobster', 'message']),
      targetGateway: gateway,
      activeGateway: gateway,
      gatewayStatus: 'connected',
      discovery: baseDiscovery,
    })

    expect(readiness.status).toBe('warning')
    expect(readiness.blocksRun).toBe(false)
    expect(readiness.messages.join('\n')).toContain('effective invoking-agent policy was not available')
  })

  it('blocks when effective invoking-agent policy proves a required tool is missing', () => {
    const readiness = validateWorkflowReadiness({
      workflow: workflow(['lobster', 'message']),
      targetGateway: gateway,
      activeGateway: gateway,
      gatewayStatus: 'connected',
      discovery: {
        ...baseDiscovery,
        effectiveTools: {
          agentId: 'main',
          sessionKey: 'agent:main:main',
          profile: 'minimal',
          tools: ['lobster'],
        },
      },
    })

    expect(readiness.status).toBe('blocked')
    expect(readiness.blocksRun).toBe(true)
    expect(readiness.missingEffectiveTools).toEqual(['message'])
    expect(readiness.messages.join('\n')).toContain('Invoking agent main is missing policy access: message.')
  })

  it('blocks Run Agent when effective invoking-agent policy lacks sessions_spawn', () => {
    const readiness = validateWorkflowReadiness({
      workflow: runAgentWorkflow(),
      targetGateway: gateway,
      activeGateway: gateway,
      gatewayStatus: 'connected',
      discovery: {
        ...baseDiscovery,
        effectiveTools: {
          agentId: 'main',
          sessionKey: 'agent:main:main',
          profile: 'minimal',
          tools: ['lobster'],
        },
      },
    })

    expect(readiness.status).toBe('blocked')
    expect(readiness.blocksRun).toBe(true)
    expect(readiness.missingEffectiveTools).toEqual(['sessions_spawn'])
    expect(readiness.messages.join('\n')).toContain('Invoking agent main is missing policy access: sessions_spawn.')
  })

  it('blocks Node Action actions that are missing a node or command', () => {
    const readiness = validateWorkflowReadiness({
      workflow: nodeActionWorkflow({ node: '', invokeCommand: '', invokeParamsJson: '{}' }),
      targetGateway: gateway,
      activeGateway: gateway,
      gatewayStatus: 'connected',
      discovery: baseDiscovery,
    })

    expect(readiness.status).toBe('blocked')
    expect(readiness.blocksRun).toBe(true)
    expect(readiness.missingNativeRequirements).toEqual([
      'node-status: choose a paired node.',
      'node-status: enter a node command.',
    ])
  })

  it('blocks Node Action actions with non-object params JSON', () => {
    const readiness = validateWorkflowReadiness({
      workflow: nodeActionWorkflow({
        node: 'macbook',
        invokeCommand: 'device.status',
        invokeParamsJson: '[]',
      }),
      targetGateway: gateway,
      activeGateway: gateway,
      gatewayStatus: 'connected',
      discovery: baseDiscovery,
    })

    expect(readiness.status).toBe('blocked')
    expect(readiness.blocksRun).toBe(true)
    expect(readiness.missingNativeRequirements).toEqual([
      'node-status: enter Node Action params as a JSON object.',
    ])
  })

  it('blocks Node Action when connected gateway discovery proves nodes is missing', () => {
    const readiness = validateWorkflowReadiness({
      workflow: nodeActionWorkflow(),
      targetGateway: gateway,
      activeGateway: gateway,
      gatewayStatus: 'connected',
      discovery: {
        ...baseDiscovery,
        tools: ['lobster', 'message', 'llm-task', 'sessions_spawn'],
      },
    })

    expect(readiness.status).toBe('blocked')
    expect(readiness.blocksRun).toBe(true)
    expect(readiness.requiredTools).toEqual(['lobster', 'nodes'])
    expect(readiness.missingGatewayTools).toEqual(['nodes'])
    expect(readiness.messages.join('\n')).toContain('Missing from gateway tool catalog: nodes.')
  })

  it('blocks Node Action when effective invoking-agent policy lacks nodes', () => {
    const readiness = validateWorkflowReadiness({
      workflow: nodeActionWorkflow(),
      targetGateway: gateway,
      activeGateway: gateway,
      gatewayStatus: 'connected',
      discovery: {
        ...baseDiscovery,
        effectiveTools: {
          agentId: 'main',
          sessionKey: 'agent:main:main',
          profile: 'minimal',
          tools: ['lobster'],
        },
      },
    })

    expect(readiness.status).toBe('blocked')
    expect(readiness.blocksRun).toBe(true)
    expect(readiness.missingEffectiveTools).toEqual(['nodes'])
    expect(readiness.messages.join('\n')).toContain('Invoking agent main is missing policy access: nodes.')
  })

  it('reports ready when effective invoking-agent policy includes every requirement', () => {
    const readiness = validateWorkflowReadiness({
      workflow: workflow(['lobster', 'message']),
      targetGateway: gateway,
      activeGateway: gateway,
      gatewayStatus: 'connected',
      discovery: {
        ...baseDiscovery,
        effectiveTools: {
          agentId: 'main',
          sessionKey: 'agent:main:main',
          profile: 'messaging',
          tools: ['lobster', 'message'],
        },
      },
    })

    expect(readiness.status).toBe('ready')
    expect(readiness.blocksRun).toBe(false)
    expect(readiness.messages.join('\n')).toContain('Effective policy for agent main includes every required tool.')
  })
})
