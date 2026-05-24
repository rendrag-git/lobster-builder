import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigPanel } from '../app/ConfigPanel'
import { useGatewayStore } from '../store/gateway-store'
import { useLobsterStore } from '../store/lobster-store'
import { useWorkflowStore } from '../store/workflow-store'
import type { SavedGateway } from '../lib/gateway-client'
import '../actions/init'

const gateway: SavedGateway = {
  id: 'home',
  name: 'Home',
  url: '',
  token: 'token',
}

const refreshPublishedWorkflowsAction = useLobsterStore.getState().refreshPublishedWorkflows

beforeEach(() => {
  useWorkflowStore.setState({
    nodes: [],
    edges: [],
    workflowMeta: { name: 'Bundle parent', description: '' },
    selectedNodeId: null,
  })
  useGatewayStore.setState({
    config: gateway,
    gateways: [gateway],
    selectedGatewayId: gateway.id,
    status: 'connected',
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
    refreshPublishedWorkflows: refreshPublishedWorkflowsAction,
  })
})

describe('ConfigPanel bundle library', () => {
  it('edits parallel bundle branches without raw YAML editing', async () => {
    const user = userEvent.setup()

    render(<ConfigPanel />)

    await user.selectOptions(screen.getByTestId('bundle-mode-select'), 'parallel')
    await user.type(screen.getByTestId('workflow-ref-draft'), 'alpha@1')
    await user.click(screen.getByTestId('workflow-ref-add'))
    await user.type(screen.getByTestId('workflow-ref-draft'), 'beta@2')
    await user.click(screen.getByTestId('workflow-ref-add'))

    expect(screen.getByTestId('parallel-join-summary')).toHaveTextContent('Join: all')
    expect(screen.getAllByTestId('workflow-ref-row')).toHaveLength(2)
    expect(screen.getByTestId('workflow-refs-input')).toHaveValue('alpha@1\nbeta@2')

    await user.click(screen.getByTestId('workflow-ref-move-up-1'))
    expect(screen.getByTestId('workflow-refs-input')).toHaveValue('beta@2\nalpha@1')

    await user.click(screen.getByTestId('workflow-ref-remove-0'))
    expect(screen.getByTestId('workflow-refs-input')).toHaveValue('alpha@1')
    expect(useWorkflowStore.getState().workflowMeta.bundle).toMatchObject({
      mode: 'parallel',
      workflowRefs: ['alpha@1'],
    })
  })

  it('adds published workflows as bundle refs and executable child blocks', async () => {
    const user = userEvent.setup()
    useLobsterStore.setState({
      publishedWorkflows: [
        {
          workflowId: 'child-flow',
          name: 'Child Flow',
          revision: 2,
          status: 'published',
          bundleMode: 'library',
          reusable: true,
        },
      ],
      publishedWorkflowsStatus: 'ready',
    })

    render(<ConfigPanel />)

    await user.click(screen.getByTestId('workflow-library-add-ref-child-flow'))
    expect(screen.getByTestId('workflow-refs-input')).toHaveValue('child-flow@2')

    await user.click(screen.getByTestId('workflow-library-add-block-child-flow'))
    const node = useWorkflowStore.getState().nodes.at(-1)
    expect(node?.data.actionId).toBe('run-sub-workflow')
    expect(node?.data.config).toMatchObject({
      target: 'published',
      workflowId: 'child-flow',
      workflowRevision: 2,
      passInput: true,
    })
    expect(useWorkflowStore.getState().workflowMeta.bundle?.workflowRefs).toEqual(['child-flow@2'])
  })

  it('refreshes the published workflow library through the selected gateway', async () => {
    const user = userEvent.setup()
    const refreshPublishedWorkflows = vi.fn(async () => undefined)
    useLobsterStore.setState({ refreshPublishedWorkflows })

    render(<ConfigPanel />)

    await user.click(screen.getByTestId('workflow-library-refresh'))

    expect(refreshPublishedWorkflows).toHaveBeenCalledWith({ gatewayConfig: gateway })
  })
})
