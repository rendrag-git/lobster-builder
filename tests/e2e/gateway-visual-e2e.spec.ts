import { expect, type Page, test } from '@playwright/test'
import { parse } from 'yaml'

interface ToolInvocation {
  tool: string
  args: Record<string, unknown>
}

interface GatewayRpcInvocation {
  method: string
  params: Record<string, unknown>
}

function workflowYamlFrom(invocation: { params?: Record<string, unknown>; args?: Record<string, unknown> }): string {
  const source = invocation.params ?? invocation.args ?? {}
  const workflowYaml = source.workflowYaml
  expect(typeof workflowYaml).toBe('string')
  expect(workflowYaml).not.toHaveLength(0)
  return workflowYaml as string
}

async function installGatewayFixture(
  page: Page,
  params: { invocations: ToolInvocation[]; publishInvocations: GatewayRpcInvocation[] },
) {
  await page.exposeFunction('__recordLobsterGatewayRpc', (method: string, rpcParams: Record<string, unknown>) => {
    if (method === 'lobster.workflow.publish' || method === 'cron.add') {
      params.publishInvocations.push({ method, params: rpcParams })
    }
  })
  await page.addInitScript(() => {
    class MockWebSocket {
      static CONNECTING = 0
      static OPEN = 1
      static CLOSED = 3

      readyState = MockWebSocket.OPEN
      onmessage: ((event: { data: string }) => void) | null = null
      onerror: (() => void) | null = null

      constructor() {
        setTimeout(() => {
          this.emit({ type: 'event', event: 'connect.challenge', payload: { nonce: 'nonce-1' } })
        }, 0)
      }

      send(raw: string) {
        const frame = JSON.parse(raw) as Record<string, unknown>
        if (frame.method === 'connect') {
          setTimeout(() => {
            this.emit({
              type: 'res',
              id: frame.id,
              ok: true,
              payload: {
                type: 'hello-ok',
                protocol: 4,
                server: { version: 'test', connId: 'conn-1' },
                features: { methods: ['tools.effective', 'lobster.workflow.publish', 'cron.add'], events: [] },
                snapshot: {},
                auth: { role: 'operator', scopes: ['operator.read', 'operator.write'] },
                policy: { maxPayload: 1, maxBufferedBytes: 1, tickIntervalMs: 1000 },
              },
            })
          }, 0)
          return
        }

        const rpcParams = (frame.params ?? {}) as Record<string, unknown>
        if (frame.method === 'tools.effective') {
          setTimeout(() => {
            this.emit({
              type: 'res',
              id: frame.id,
              ok: true,
              payload: {
                agentId: 'builder-agent',
                sessionKey: rpcParams.sessionKey,
                profile: 'e2e',
                groups: [
                  { id: 'native-actions', tools: ['lobster', 'message'] },
                ],
              },
            })
          }, 0)
          return
        }

        void (window as unknown as {
          __recordLobsterGatewayRpc: (method: string, params: Record<string, unknown>) => Promise<void>
        }).__recordLobsterGatewayRpc(String(frame.method), rpcParams)
        if (frame.method === 'cron.add') {
          setTimeout(() => {
            this.emit({
              type: 'res',
              id: frame.id,
              ok: true,
              payload: {
                id: 'cron-daily-support',
                name: rpcParams.name,
                enabled: rpcParams.enabled,
                schedule: rpcParams.schedule,
                sessionTarget: rpcParams.sessionTarget,
                agentId: rpcParams.agentId,
                sessionKey: rpcParams.sessionKey,
                wakeMode: rpcParams.wakeMode,
                payload: rpcParams.payload,
                delivery: rpcParams.delivery,
                createdAtMs: 1,
                updatedAtMs: 1,
                state: {},
              },
            })
          }, 0)
          return
        }
        setTimeout(() => {
          this.emit({
            type: 'res',
            id: frame.id,
            ok: true,
            payload: {
              ok: true,
              workflow: {
                workflowId: rpcParams.workflowId,
                name: rpcParams.name,
                revision: 1,
                status: 'published',
                cwd: rpcParams.cwd,
                workflowPath: '.openclaw/lobster/workflows/daily-support/rev-1.lobster',
                sha256: 'e2e-sha256',
                createdAt: '2026-05-22T00:00:00.000Z',
                updatedAt: '2026-05-22T00:00:00.000Z',
              },
            },
          })
        }, 0)
      }

      close() {
        this.readyState = MockWebSocket.CLOSED
      }

      emit(frame: Record<string, unknown>) {
        this.onmessage?.({ data: JSON.stringify(frame) })
      }
    }

    ;(window as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket
  })

  await page.route('**/api/discover', async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: { message: 'not available in e2e fixture' } }),
    })
  })

  await page.route('**/tools/invoke', async (route) => {
    const requestBody = route.request().postDataJSON() as ToolInvocation
    params.invocations.push(requestBody)

    if (requestBody.tool === 'agents_list') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          result: {
            agents: [{ id: 'builder-agent', name: 'Builder Agent', default: true }],
          },
        }),
      })
      return
    }

    if (requestBody.tool === 'session_status') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          result: {
            sessionKey: 'agent:builder-agent:main',
            agentId: 'builder-agent',
            model: 'e2e/model',
            models: [{ id: 'e2e/model', alias: 'E2E Model', provider: 'mock' }],
          },
        }),
      })
      return
    }

    if (requestBody.tool === 'tools.catalog') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          result: {
            groups: [
              { id: 'native-actions', tools: ['lobster', 'message'] },
            ],
          },
        }),
      })
      return
    }

    if (requestBody.tool === 'channels.status') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          result: {
            channelOrder: ['qa-channel'],
            channels: {
              'qa-channel': { enabled: true, type: 'qa-channel' },
            },
            channelAccounts: {
              'qa-channel': [{ enabled: true, configured: true }],
            },
          },
        }),
      })
      return
    }

    if (requestBody.tool === 'node.list') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          result: { nodes: [] },
        }),
      })
      return
    }

    if (requestBody.tool === 'lobster') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          result: {
            details: {
              envelope: {
                ok: true,
                status: 'ok',
                output: [{ ok: true, tool: 'message', action: 'send' }],
                requiresApproval: null,
              },
            },
          },
        }),
      })
      return
    }

    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        error: { message: `Unexpected tool invocation: ${requestBody.tool}` },
      }),
    })
  })
}

test('disables run and publish for an empty canvas', async ({ page }) => {
  const invocations: ToolInvocation[] = []
  const publishInvocations: ToolInvocation[] = []
  await installGatewayFixture(page, { invocations, publishInvocations })

  await page.goto('/')
  await expect(page.getByTestId('template-picker')).toBeVisible()
  await page.getByTestId('template-blank-canvas').click()
  await page.getByTestId('open-gateway-panel').click()
  await page.getByTestId('gateway-name-input').fill('E2E Gateway')
  await page.getByTestId('gateway-url-input').fill('')
  await page.getByTestId('gateway-token-input').fill('test-token')
  await page.getByTestId('gateway-connect-btn').click()
  await expect(page.getByTestId('gateway-panel').getByText('Connected')).toBeVisible()
  await page.getByTestId('gateway-close-btn').click()

  await page.getByTestId('yaml-preview-tab').click()

  await page.getByTestId('run-workflow-tooltip').hover()
  await expect(
    page.getByRole('tooltip').filter({ hasText: 'does not start an agent turn or post to a channel' }),
  ).toBeVisible()

  await page.getByTestId('publish-workflow-tooltip').hover()
  await expect(
    page.getByRole('tooltip').filter({ hasText: 'Deploy stores the workflow artifact' }),
  ).toBeVisible()

  await expect(page.getByTestId('run-workflow-btn')).toBeDisabled()
  await expect(page.getByTestId('publish-workflow-btn')).toBeDisabled()
  expect(publishInvocations).toHaveLength(0)
})

test('builds a parallel bundle through the visual branch composer', async ({ page }) => {
  const invocations: ToolInvocation[] = []
  const publishInvocations: GatewayRpcInvocation[] = []
  await installGatewayFixture(page, { invocations, publishInvocations })

  await page.goto('/')
  await expect(page.getByTestId('template-picker')).toBeVisible()
  await page.getByTestId('template-blank-canvas').click()
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()
  await page.getByTestId('action-run-sub-workflow').dragTo(page.getByTestId('workflow-canvas'), {
    targetPosition: { x: 360, y: 220 },
  })
  const subWorkflowNode = page.locator('[data-action-id="run-sub-workflow"]')
  await expect(subWorkflowNode).toBeVisible()
  await subWorkflowNode.click()
  await page.getByTestId('config-field-workflowId').fill('visual-composer-child')

  await page.getByTestId('bundle-mode-select').selectOption('parallel')
  await page.getByTestId('workflow-ref-draft').fill('alpha-child@1')
  await page.getByTestId('workflow-ref-add').click()
  await page.getByTestId('workflow-ref-draft').fill('beta-child@2')
  await page.getByTestId('workflow-ref-add').click()
  await expect(page.getByTestId('parallel-join-summary')).toContainText('Join: all')
  await expect(page.getByTestId('workflow-refs-input')).toHaveValue('alpha-child@1\nbeta-child@2')

  await page.getByTestId('workflow-ref-move-up-1').click()
  await expect(page.getByTestId('workflow-refs-input')).toHaveValue('beta-child@2\nalpha-child@1')

  await page.getByTestId('yaml-preview-tab').click()
  const yamlText = await page.getByTestId('yaml-preview-content').innerText()
  const parsed = parse(yamlText) as { steps: Array<Record<string, unknown>> }
  expect(parsed.steps[0]).toMatchObject({
    id: 'openclaw_parallel_bundle',
    openclaw_parallel_bundle: {
      wait: 'all',
      branches: [
        expect.objectContaining({
          ref: 'beta-child@2',
          workflowId: 'beta-child',
          workflowRevision: 2,
          pipeline: expect.stringContaining("lobster.workflow --workflow-id 'beta-child'"),
        }),
        expect.objectContaining({
          ref: 'alpha-child@1',
          workflowId: 'alpha-child',
          workflowRevision: 1,
          pipeline: expect.stringContaining("lobster.workflow --workflow-id 'alpha-child'"),
        }),
      ],
    },
  })
  expect(String(parsed.steps[0].pipeline)).toContain('lobster.parallel --branches-json')
  expect(publishInvocations).toHaveLength(0)
})

test('selects a gateway, builds a scheduled Lobster flow, parses YAML, and publishes it', async ({ page }) => {
  const invocations: ToolInvocation[] = []
  const publishInvocations: ToolInvocation[] = []
  await installGatewayFixture(page, { invocations, publishInvocations })

  await page.goto('/')
  await expect(page.getByTestId('template-picker')).toBeVisible()
  await page.getByTestId('template-blank-canvas').click()
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()
  await page.getByTestId('action-run-sub-workflow').dragTo(page.getByTestId('workflow-canvas'), {
    targetPosition: { x: 360, y: 220 },
  })

  const subWorkflowNode = page.locator('[data-action-id="run-sub-workflow"]')
  await expect(subWorkflowNode).toBeVisible()
  await subWorkflowNode.click()
  await page.getByTestId('config-field-workflowId').fill('daily-support-child')
  await page.getByTestId('config-field-workflowRevision').fill('2')
  await page.getByTestId('config-field-argsJson').fill('{"customerId":"$lookup.json.id"}')

  await page.getByTestId('open-gateway-panel').click()
  await page.getByTestId('gateway-name-input').fill('E2E Gateway')
  await page.getByTestId('gateway-url-input').fill('')
  await page.getByTestId('gateway-token-input').fill('test-token')
  await page.getByTestId('gateway-connect-btn').click()
  await expect(page.getByTestId('gateway-panel').getByText('Connected')).toBeVisible()
  await page.getByTestId('gateway-close-btn').click()

  await page.getByTestId('workflow-gateway-select').selectOption({ label: 'E2E Gateway' })
  await page.getByTestId('cron-input').fill('0 9 * * 1-5')
  await page.getByTestId('timezone-input').fill('UTC')
  await page.getByTestId('schedule-enabled').check()
  await page.getByTestId('bundle-mode-select').selectOption('chain')
  await page.getByTestId('flow-id-input').fill('daily-support')
  await page.getByTestId('bundle-name-input').fill('Daily Support')
  await page.getByTestId('reusable-bundle').check()
  await page.getByTestId('workflow-refs-input').fill('daily-support-child@2')

  await page.getByTestId('yaml-preview-tab').click()
  await page.getByTestId('publish-workflow-tooltip').hover()
  await expect(
    page.getByRole('tooltip').filter({ hasText: 'Message delivery happens only if the workflow includes a Send Channel Message block' }),
  ).toBeVisible()

  const yamlText = await page.getByTestId('yaml-preview-content').innerText()
  const parsed = parse(yamlText) as Record<string, unknown>
  const openclaw = parsed.openclaw as Record<string, unknown>
  const gateway = openclaw.gateway as Record<string, unknown>
  const schedule = openclaw.schedule as Record<string, unknown>
  const bundle = openclaw.bundle as Record<string, unknown>

  expect(Array.isArray(parsed.steps)).toBe(true)
  expect(gateway).toMatchObject({ id: 'gateway:same-origin', name: 'E2E Gateway' })
  expect(schedule).toMatchObject({ enabled: true, cron: '0 9 * * 1-5', timezone: 'UTC' })
  expect(bundle).toMatchObject({
    id: 'daily-support',
    name: 'Daily Support',
    mode: 'chain',
    reusable: true,
    workflowRefs: ['daily-support-child@2'],
  })
  expect(parsed.steps).toEqual([
    expect.objectContaining({
      pipeline: expect.stringContaining("lobster.workflow --workflow-id 'daily-support-child'"),
      openclaw_workflow_ref: {
        target: 'published',
        workflowId: 'daily-support-child',
        workflowRevision: 2,
        args: { customerId: '$lookup.json.id' },
      },
    }),
  ])

  await page.getByTestId('publish-workflow-btn').click()
  await expect.poll(() => publishInvocations.length).toBe(2)
  await expect(page.getByText('Completed')).toBeVisible()

  const publish = publishInvocations.find((invocation) => invocation.method === 'lobster.workflow.publish')
  expect(publish).toBeDefined()
  expect(publish?.method).toBe('lobster.workflow.publish')
  expect(publish?.params).toMatchObject({
    workflowId: 'daily-support',
    id: 'daily-support',
    name: 'Untitled Workflow',
    metadata: {
      bundle: {
        id: 'daily-support',
        mode: 'chain',
        workflowRefs: ['daily-support-child@2'],
      },
    },
  })

  const cronAdd = publishInvocations.find((invocation) => invocation.method === 'cron.add')
  expect(cronAdd?.params).toMatchObject({
    name: 'lobster:daily-support',
    enabled: true,
    schedule: { kind: 'cron', expr: '0 9 * * 1-5', tz: 'UTC' },
    sessionTarget: 'isolated',
    sessionKey: 'agent:builder-agent:main',
    agentId: 'builder-agent',
    wakeMode: 'now',
    payload: {
      kind: 'agentTurn',
      message: expect.stringContaining('"workflowId":"daily-support"'),
      toolsAllow: ['lobster'],
    },
    delivery: { mode: 'none' },
  })

  const publishedYaml = workflowYamlFrom(publish!)
  expect(parse(publishedYaml)).toMatchObject({
    openclaw: {
      gateway: { id: 'gateway:same-origin', name: 'E2E Gateway' },
      schedule: { enabled: true, cron: '0 9 * * 1-5', timezone: 'UTC' },
      bundle: { id: 'daily-support', mode: 'chain', reusable: true },
    },
    steps: [
      {
        pipeline: expect.stringContaining("lobster.workflow --workflow-id 'daily-support-child'"),
        openclaw_workflow_ref: {
          target: 'published',
          workflowId: 'daily-support-child',
          workflowRevision: 2,
          args: { customerId: '$lookup.json.id' },
        },
      },
    ],
  })

  expect(invocations.map((invocation) => invocation.tool)).toEqual(
    expect.arrayContaining(['agents_list', 'session_status']),
  )
})

test('loads native message example, runs it, and publishes message workflow YAML', async ({ page }) => {
  const invocations: ToolInvocation[] = []
  const publishInvocations: GatewayRpcInvocation[] = []
  await installGatewayFixture(page, { invocations, publishInvocations })

  await page.goto('/')
  await expect(page.getByTestId('template-picker')).toBeVisible()
  await page.getByTestId('template-card-native-message-example').click()
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()

  await page.getByTestId('open-gateway-panel').click()
  await page.getByTestId('gateway-name-input').fill('E2E Gateway')
  await page.getByTestId('gateway-url-input').fill('')
  await page.getByTestId('gateway-token-input').fill('test-token')
  await page.getByTestId('gateway-connect-btn').click()
  await expect(page.getByTestId('gateway-panel').getByText('Connected')).toBeVisible()
  await page.getByTestId('gateway-close-btn').click()

  await page.getByTestId('yaml-preview-tab').click()
  await expect(page.getByTestId('workflow-readiness')).toContainText('Requires lobster + message')
  await expect(page.getByTestId('workflow-readiness')).toContainText('Channels qa-channel')
  await expect(page.getByTestId('run-workflow-btn')).toBeEnabled()
  await expect(page.getByTestId('publish-workflow-btn')).toBeEnabled()

  await page.getByTestId('run-workflow-tooltip').hover()
  await expect(
    page.getByRole('tooltip').filter({ hasText: 'Native message steps can post to the configured OpenClaw channel' }),
  ).toBeVisible()

  const yamlText = await page.getByTestId('yaml-preview-content').innerText()
  expect(yamlText).not.toMatch(/authorization|bearer|token|secret/i)
  const parsed = parse(yamlText) as Record<string, unknown>
  expect(parsed).toMatchObject({
    name: 'native-message-example',
    steps: [
      { id: 'prepare-message' },
      { id: 'approve-message' },
      {
        id: 'send-message',
        openclaw_action: {
          tool: 'message',
          action: 'send',
          args: {
            provider: 'qa-channel',
            to: 'channel:lobster-builder-proof',
            message: 'Lobster Builder native message example completed.',
          },
          requiredTools: ['lobster', 'message'],
        },
      },
    ],
  })

  await page.getByTestId('run-workflow-btn').click()
  await expect(page.getByText('Completed', { exact: true })).toBeVisible()
  const runInvocation = invocations.find((invocation) => invocation.tool === 'lobster')
  expect(runInvocation).toBeDefined()
  expect(runInvocation?.args).toMatchObject({
    action: 'run',
    flowControllerId: 'lobster-builder/test-run',
  })
  const runYaml = workflowYamlFrom({ args: runInvocation?.args })
  expect(parse(runYaml)).toMatchObject({
    steps: [
      { id: 'prepare-message' },
      { id: 'approve-message' },
      { id: 'send-message', openclaw_action: { tool: 'message', action: 'send' } },
    ],
  })

  await page.getByTestId('publish-workflow-btn').click()
  await expect.poll(() => publishInvocations.length).toBe(1)

  const publish = publishInvocations[0]
  expect(publish.method).toBe('lobster.workflow.publish')
  const publishedYaml = workflowYamlFrom(publish)
  expect(publishedYaml).not.toMatch(/authorization|bearer|token|secret/i)
  expect(parse(publishedYaml)).toMatchObject({
    steps: [
      { id: 'prepare-message' },
      { id: 'approve-message' },
      { id: 'send-message', openclaw_action: { tool: 'message', action: 'send' } },
    ],
  })
})
