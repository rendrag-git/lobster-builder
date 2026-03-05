import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkflowStore } from '../workflow-store'

// Reset store between tests
beforeEach(() => {
  useWorkflowStore.getState().reset()
})

describe('useWorkflowStore', () => {
  it('starts with empty nodes and edges', () => {
    const { nodes, edges } = useWorkflowStore.getState()
    expect(nodes).toHaveLength(0)
    expect(edges).toHaveLength(0)
  })

  it('addNode adds a node with given actionId and position', () => {
    useWorkflowStore.getState().addNode('prompt-llm', { x: 100, y: 200 })
    const { nodes } = useWorkflowStore.getState()
    expect(nodes).toHaveLength(1)
    expect(nodes[0].data.actionId).toBe('prompt-llm')
    expect(nodes[0].position).toEqual({ x: 100, y: 200 })
  })

  it('addNode assigns a unique id each time', () => {
    useWorkflowStore.getState().addNode('call-agent', { x: 0, y: 0 })
    useWorkflowStore.getState().addNode('call-agent', { x: 50, y: 50 })
    const { nodes } = useWorkflowStore.getState()
    expect(nodes[0].id).not.toBe(nodes[1].id)
  })

  it('removeNode removes the node by id', () => {
    useWorkflowStore.getState().addNode('run-shell-command', { x: 0, y: 0 })
    const id = useWorkflowStore.getState().nodes[0].id
    useWorkflowStore.getState().removeNode(id)
    expect(useWorkflowStore.getState().nodes).toHaveLength(0)
  })

  it('updateNodeConfig merges config into node data', () => {
    useWorkflowStore.getState().addNode('prompt-llm', { x: 0, y: 0 })
    const id = useWorkflowStore.getState().nodes[0].id
    useWorkflowStore.getState().updateNodeConfig(id, { prompt: 'Hello world' })
    const node = useWorkflowStore.getState().nodes[0]
    expect(node.data.config).toMatchObject({ prompt: 'Hello world' })
  })

  it('updateNodeConfig does not overwrite unrelated config keys', () => {
    useWorkflowStore.getState().addNode('prompt-llm', { x: 0, y: 0 })
    const id = useWorkflowStore.getState().nodes[0].id
    useWorkflowStore.getState().updateNodeConfig(id, { prompt: 'Hi', model: 'gpt-4' })
    useWorkflowStore.getState().updateNodeConfig(id, { prompt: 'Bye' })
    const node = useWorkflowStore.getState().nodes[0]
    expect(node.data.config.model).toBe('gpt-4')
    expect(node.data.config.prompt).toBe('Bye')
  })

  it('selectNode sets selectedNodeId', () => {
    useWorkflowStore.getState().addNode('call-agent', { x: 0, y: 0 })
    const id = useWorkflowStore.getState().nodes[0].id
    useWorkflowStore.getState().selectNode(id)
    expect(useWorkflowStore.getState().selectedNodeId).toBe(id)
  })

  it('selectNode(null) clears selection', () => {
    useWorkflowStore.getState().selectNode('some-id')
    useWorkflowStore.getState().selectNode(null)
    expect(useWorkflowStore.getState().selectedNodeId).toBeNull()
  })

  it('setWorkflowMeta updates meta fields', () => {
    useWorkflowStore.getState().setWorkflowMeta({ name: 'My Flow', description: 'Desc' })
    const { workflowMeta } = useWorkflowStore.getState()
    expect(workflowMeta.name).toBe('My Flow')
    expect(workflowMeta.description).toBe('Desc')
  })

  it('reset clears all state', () => {
    useWorkflowStore.getState().addNode('call-agent', { x: 0, y: 0 })
    useWorkflowStore.getState().setWorkflowMeta({ name: 'Test' })
    useWorkflowStore.getState().reset()
    const state = useWorkflowStore.getState()
    expect(state.nodes).toHaveLength(0)
    expect(state.edges).toHaveLength(0)
    expect(state.workflowMeta.name).toBe('Untitled Workflow')
    expect(state.selectedNodeId).toBeNull()
  })
})
