import { describe, it, expect } from 'vitest'
import type { ActionDefinition, ConfigField, PortDefinition } from '../actions'
import type { LobsterStep } from '../lobster'

describe('ActionDefinition', () => {
  it('can define an action with all required fields', () => {
    const port: PortDefinition = { id: 'in', label: 'Input', kind: 'text' }
    const field: ConfigField = {
      id: 'prompt',
      label: 'Prompt',
      type: 'textarea',
      defaultValue: '',
    }
    const action: ActionDefinition = {
      id: 'prompt-llm',
      name: 'Prompt LLM',
      category: 'ai',
      icon: 'brain',
      description: 'Send a prompt to an LLM',
      inputs: [port],
      outputs: [{ id: 'out', label: 'Response', kind: 'text' }],
      configFields: [field],
      defaults: { prompt: '' },
      compile: (_config, ctx): LobsterStep[] => [
        { id: ctx.nodeId, command: 'claude' },
      ],
    }

    expect(action.id).toBe('prompt-llm')
    expect(action.category).toBe('ai')
    expect(action.compile({}, { nodeId: 'node-1', incomingEdges: [], outgoingEdges: [] })).toEqual([
      { id: 'node-1', command: 'claude' },
    ])
  })

  it('supports all valid categories', () => {
    const categories: ActionDefinition['category'][] = ['ai', 'flow', 'data', 'io', 'meta']
    expect(categories).toHaveLength(5)
  })

  it('supports all valid config field types', () => {
    const types: ConfigField['type'][] = ['text', 'textarea', 'number', 'boolean', 'select', 'code']
    expect(types).toHaveLength(6)
  })
})
