import { describe, it, expect } from 'vitest'
import type { LobsterWorkflowFile, LobsterStep } from '../lobster'

describe('LobsterWorkflowFile', () => {
  it('allows a minimal workflow with just steps', () => {
    const workflow: LobsterWorkflowFile = {
      steps: [{ id: 'step1', command: 'echo hello' }],
    }
    expect(workflow.steps).toHaveLength(1)
    expect(workflow.steps[0].id).toBe('step1')
  })

  it('allows a full workflow with all optional fields', () => {
    const workflow: LobsterWorkflowFile = {
      name: 'My Workflow',
      description: 'Does things',
      args: { model: { default: 'gpt-4', description: 'LLM model' } },
      env: { API_KEY: '$env:OPENAI_KEY' },
      cwd: '/tmp',
      steps: [],
    }
    expect(workflow.name).toBe('My Workflow')
    expect(workflow.args?.model.default).toBe('gpt-4')
  })

  it('allows LobsterStep with stdin reference', () => {
    const step: LobsterStep = {
      id: 'step2',
      command: 'claude',
      stdin: '$step1.stdout',
    }
    expect(step.stdin).toBe('$step1.stdout')
  })

  it('allows OpenClaw native action metadata on a pipeline step', () => {
    const step: LobsterStep = {
      id: 'notify',
      pipeline: 'openclaw.invoke --tool message --action send',
      openclaw_action: {
        tool: 'message',
        action: 'send',
        args: { provider: 'discord', to: 'ops', message: 'done' },
        requiredTools: ['lobster', 'message'],
      },
    }

    expect(step.openclaw_action?.tool).toBe('message')
  })

  it('allows approval field as boolean or string', () => {
    const stepBool: LobsterStep = { id: 's1', command: 'rm -rf /', approval: true }
    const stepStr: LobsterStep = { id: 's2', command: 'deploy', approval: 'required' }
    expect(stepBool.approval).toBe(true)
    expect(stepStr.approval).toBe('required')
  })
})
