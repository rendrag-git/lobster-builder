import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { YamlPreview } from '../app/YamlPreview'
import { useGatewayStore } from '../store/gateway-store'
import { useLobsterStore } from '../store/lobster-store'
import { useWorkflowStore } from '../store/workflow-store'
import type { SavedGateway } from '../lib/gateway-client'
import type { WorkflowNode } from '../types/graph'
import '../actions/init'

const gateway: SavedGateway = {
  id: 'home',
  name: 'Home',
  url: '',
  token: 'token',
}

function node(id: string, actionId: string, config: Record<string, unknown>): WorkflowNode {
  return { id, type: 'workflowNode', position: { x: 0, y: 0 }, data: { actionId, config } }
}

beforeEach(() => {
  useWorkflowStore.setState({
    nodes: [],
    edges: [],
    workflowMeta: { name: 'Readiness test', description: '' },
    selectedNodeId: null,
  })
  useGatewayStore.setState({
    config: null,
    gateways: [],
    selectedGatewayId: null,
    status: 'disconnected',
    discovery: null,
    lastError: null,
    lastRefresh: null,
  })
  useLobsterStore.setState({
    execStatus: 'idle',
    lastResult: null,
    lastError: null,
    currentRun: null,
    publishedWorkflows: [],
    publishedWorkflowsStatus: 'idle',
    publishedWorkflowsError: null,
    haltedWorkflows: [],
    pendingResumeGatewayConfig: null,
  })
})

describe('YamlPreview readiness', () => {
  it('shows missing native tools and disables gateway actions', () => {
    useWorkflowStore.setState({
      nodes: [
        node('notify', 'send-channel-message', {
          channel: 'discord',
          target: 'ops',
          message: 'done',
        }),
      ],
      workflowMeta: { name: 'Readiness test', description: '' },
    })
    useGatewayStore.setState({
      config: gateway,
      gateways: [gateway],
      selectedGatewayId: gateway.id,
      status: 'connected',
      discovery: {
        agents: [],
        models: [],
        channels: [],
        skills: [],
        tools: ['lobster'],
        effectiveTools: null,
      },
      lastError: null,
      lastRefresh: Date.now(),
    })

    render(<YamlPreview />)

    expect(screen.getByTestId('workflow-readiness')).toHaveTextContent('Requires lobster + message')
    expect(screen.getByTestId('workflow-readiness')).toHaveTextContent('Missing from gateway tool catalog: message.')
    expect(screen.getByTestId('run-workflow-btn')).toBeDisabled()
    expect(screen.getByTestId('publish-workflow-btn')).toBeDisabled()
  })

  it('shows missing llm-task and disables gateway actions', () => {
    useWorkflowStore.setState({
      nodes: [
        node('classify', 'llm-json-task', {
          prompt: 'Return JSON.',
          inputJson: '{"subject":"Hello"}',
        }),
      ],
      workflowMeta: { name: 'Readiness test', description: '' },
    })
    useGatewayStore.setState({
      config: gateway,
      gateways: [gateway],
      selectedGatewayId: gateway.id,
      status: 'connected',
      discovery: {
        agents: [],
        models: [],
        channels: [],
        skills: [],
        tools: ['lobster'],
        effectiveTools: null,
      },
      lastError: null,
      lastRefresh: Date.now(),
    })

    render(<YamlPreview />)

    expect(screen.getByTestId('workflow-readiness')).toHaveTextContent('Requires llm-task + lobster')
    expect(screen.getByTestId('workflow-readiness')).toHaveTextContent('Missing from gateway tool catalog: llm-task.')
    expect(screen.getByTestId('run-workflow-btn')).toBeDisabled()
    expect(screen.getByTestId('publish-workflow-btn')).toBeDisabled()
  })

  it('shows missing effective agent permissions and disables gateway actions', () => {
    useWorkflowStore.setState({
      nodes: [
        node('notify', 'send-channel-message', {
          channel: 'discord',
          target: 'ops',
          message: 'done',
        }),
      ],
      workflowMeta: { name: 'Readiness test', description: '' },
    })
    useGatewayStore.setState({
      config: gateway,
      gateways: [gateway],
      selectedGatewayId: gateway.id,
      status: 'connected',
      discovery: {
        agents: [],
        models: [],
        channels: [{ id: 'discord', enabled: true, type: 'discord' }],
        channelDiscoveryStatus: 'available',
        skills: [],
        tools: ['lobster', 'message'],
        effectiveTools: {
          agentId: 'main',
          sessionKey: 'agent:main:main',
          profile: 'minimal',
          tools: ['lobster'],
        },
      },
      lastError: null,
      lastRefresh: Date.now(),
    })

    render(<YamlPreview />)

    expect(screen.getByTestId('workflow-readiness')).toHaveTextContent('Requires lobster + message')
    expect(screen.getByTestId('workflow-readiness')).toHaveTextContent('Invoking agent main is missing policy access: message.')
    expect(screen.getByTestId('run-workflow-btn')).toBeDisabled()
    expect(screen.getByTestId('publish-workflow-btn')).toBeDisabled()
  })

  it('shows unavailable selected channels and disables gateway actions', () => {
    useWorkflowStore.setState({
      nodes: [
        node('notify', 'send-channel-message', {
          channel: 'discord',
          target: 'ops',
          message: 'done',
        }),
      ],
      workflowMeta: { name: 'Readiness test', description: '' },
    })
    useGatewayStore.setState({
      config: gateway,
      gateways: [gateway],
      selectedGatewayId: gateway.id,
      status: 'connected',
      discovery: {
        agents: [],
        models: [],
        channels: [],
        channelDiscoveryStatus: 'available',
        skills: [],
        tools: ['lobster', 'message'],
        effectiveTools: {
          agentId: 'main',
          sessionKey: 'agent:main:main',
          tools: ['lobster', 'message'],
        },
      },
      lastError: null,
      lastRefresh: Date.now(),
    })

    render(<YamlPreview />)

    expect(screen.getByTestId('workflow-readiness')).toHaveTextContent('Channels discord')
    expect(screen.getByTestId('workflow-readiness')).toHaveTextContent('Unavailable gateway channel: discord.')
    expect(screen.getByTestId('run-workflow-btn')).toBeDisabled()
    expect(screen.getByTestId('publish-workflow-btn')).toBeDisabled()
  })

  it('disables Publish + Cron when no invoking session is discovered', () => {
    useWorkflowStore.setState({
      nodes: [
        node('shell', 'run-shell-command', {
          command: 'echo ok',
        }),
      ],
      workflowMeta: {
        name: 'Scheduled workflow',
        description: '',
        schedule: { enabled: true, cron: '0 9 * * *', timezone: 'UTC' },
      },
    })
    useGatewayStore.setState({
      config: gateway,
      gateways: [gateway],
      selectedGatewayId: gateway.id,
      status: 'connected',
      discovery: {
        agents: [],
        models: [],
        channels: [],
        skills: [],
        tools: ['lobster'],
        effectiveTools: null,
      },
      lastError: null,
      lastRefresh: Date.now(),
    })

    render(<YamlPreview />)

    expect(screen.getByTestId('run-workflow-btn')).toBeEnabled()
    expect(screen.getByTestId('publish-workflow-btn')).toBeDisabled()
  })

  it('blocks run and publish for parallel bundle mode until workflow refs are configured', () => {
    useWorkflowStore.setState({
      nodes: [
        node('shell', 'run-shell-command', {
          command: 'echo ok',
        }),
      ],
      workflowMeta: {
        name: 'Parallel bundle',
        description: '',
        bundle: {
          mode: 'parallel',
          workflowRefs: [],
        },
      },
    })
    useGatewayStore.setState({
      config: gateway,
      gateways: [gateway],
      selectedGatewayId: gateway.id,
      status: 'connected',
      discovery: {
        agents: [],
        models: [],
        channels: [],
        skills: [],
        tools: ['lobster'],
        effectiveTools: null,
      },
      lastError: null,
      lastRefresh: Date.now(),
    })

    render(<YamlPreview />)

    expect(screen.getByTestId('workflow-readiness')).toHaveTextContent('Add at least one published workflow ref')
    expect(screen.getByTestId('run-workflow-btn')).toBeDisabled()
    expect(screen.getByTestId('publish-workflow-btn')).toBeDisabled()
  })

  it('enables run and publish for executable parallel bundle refs', () => {
    useWorkflowStore.setState({
      nodes: [],
      workflowMeta: {
        name: 'Parallel bundle',
        description: '',
        bundle: {
          mode: 'parallel',
          workflowRefs: ['child-a@1', 'child-b@1'],
        },
      },
    })
    useGatewayStore.setState({
      config: gateway,
      gateways: [gateway],
      selectedGatewayId: gateway.id,
      status: 'connected',
      discovery: {
        agents: [],
        models: [],
        channels: [],
        skills: [],
        tools: ['lobster'],
        effectiveTools: null,
      },
      lastError: null,
      lastRefresh: Date.now(),
    })

    render(<YamlPreview />)

    expect(screen.getByTestId('workflow-readiness')).toHaveTextContent('Requires lobster')
    expect(screen.getByTestId('yaml-preview-content')).toHaveTextContent('lobster.parallel')
    expect(screen.getByTestId('run-workflow-btn')).toBeEnabled()
    expect(screen.getByTestId('publish-workflow-btn')).toBeEnabled()
  })

  it('pauses, resumes, and removes existing cron schedules by job id', async () => {
    const setScheduleEnabled = vi.fn(async () => ({
      ok: true,
      status: 'ok',
      output: [],
      requiresApproval: null,
    }))
    const unschedule = vi.fn(async () => ({
      ok: true,
      status: 'unscheduled',
      output: [],
      requiresApproval: null,
    }))
    useWorkflowStore.setState({
      workflowMeta: {
        name: 'Scheduled workflow',
        description: '',
        schedule: {
          enabled: true,
          cron: '0 9 * * *',
          timezone: 'UTC',
          jobId: 'cron-scheduled-workflow',
        },
      },
    })
    useLobsterStore.setState({
      setScheduleEnabled,
      unschedule,
    } as Partial<ReturnType<typeof useLobsterStore.getState>>)

    render(<YamlPreview />)

    expect(screen.getByTestId('schedule-controls')).toHaveTextContent('cron-scheduled-workflow')
    fireEvent.click(screen.getByTestId('pause-schedule-btn'))
    await waitFor(() => expect(setScheduleEnabled).toHaveBeenCalledWith('cron-scheduled-workflow', false))
    expect(useWorkflowStore.getState().workflowMeta.schedule?.enabled).toBe(false)

    fireEvent.click(screen.getByTestId('resume-schedule-btn'))
    await waitFor(() => expect(setScheduleEnabled).toHaveBeenCalledWith('cron-scheduled-workflow', true))
    expect(useWorkflowStore.getState().workflowMeta.schedule?.enabled).toBe(true)

    fireEvent.click(screen.getByTestId('remove-schedule-btn'))
    await waitFor(() => expect(unschedule).toHaveBeenCalledWith('cron-scheduled-workflow'))
    expect(useWorkflowStore.getState().workflowMeta.schedule?.enabled).toBe(false)
    expect(useWorkflowStore.getState().workflowMeta.schedule?.jobId).toBeUndefined()
  })

  it('shows managed run handles and cancels by flow id', async () => {
    const cancel = vi.fn(async () => undefined)
    useLobsterStore.setState({
      execStatus: 'approval',
      currentRun: {
        flowId: 'flow-run-1',
        revision: 2,
        status: 'waiting',
        currentStep: 'await_lobster_approval',
      },
      lastResult: {
        ok: true,
        status: 'needs_approval',
        output: [],
        requiresApproval: {
          type: 'approval_request',
          prompt: 'Approve?',
          items: [],
          resumeToken: 'resume-token',
        },
      },
      cancel,
    } as Partial<ReturnType<typeof useLobsterStore.getState>>)

    render(<YamlPreview />)

    expect(screen.getByTestId('lobster-run-handle')).toHaveTextContent('flow-run-1')
    expect(screen.getByTestId('lobster-run-handle')).toHaveTextContent('waiting')
    fireEvent.click(screen.getByTestId('cancel-run-btn'))
    await waitFor(() => expect(cancel).toHaveBeenCalledWith('flow-run-1'))
  })
})
