import { useState } from 'react'
import { useWorkflowStore } from '../store/workflow-store'
import { resolveWorkflowGatewayConfig, useGatewayStore } from '../store/gateway-store'
import { useLobsterStore } from '../store/lobster-store'
import { getAction } from '../actions/init'
import { ConfigField } from '../components/ConfigField'
import { Tooltip } from '../components/Tooltip'
import { ArrowDown, ArrowUp, GitBranch, Info, ListPlus, Plus, RefreshCw, Trash2 } from 'lucide-react'
import type { LobsterPublishedWorkflow } from '../lib/lobster-service'

function HelpLabel({ children, tooltip }: { children: string; tooltip: string }) {
  return (
    <label className="mb-1 flex items-center gap-1 text-xs text-gray-500">
      <span>{children}</span>
      <Tooltip content={tooltip} side="bottom-left" tooltipClassName="w-64">
        <span tabIndex={0} className="inline-flex rounded focus:outline-none focus:ring-1 focus:ring-gray-600">
          <Info size={12} className="text-gray-600" aria-hidden="true" />
        </span>
      </Tooltip>
    </label>
  )
}

function workflowLibraryRef(workflow: LobsterPublishedWorkflow): string {
  return workflow.revision ? `${workflow.workflowId}@${workflow.revision}` : workflow.workflowId
}

function workflowLibraryLabel(workflow: LobsterPublishedWorkflow): string {
  return workflow.name?.trim() || workflow.workflowId
}

export function ConfigPanel() {
  const [workflowRefDraft, setWorkflowRefDraft] = useState('')
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId)
  const nodes = useWorkflowStore((s) => s.nodes)
  const addConfiguredNode = useWorkflowStore((s) => s.addConfiguredNode)
  const updateNodeConfig = useWorkflowStore((s) => s.updateNodeConfig)
  const workflowMeta = useWorkflowStore((s) => s.workflowMeta)
  const setWorkflowMeta = useWorkflowStore((s) => s.setWorkflowMeta)
  const gateways = useGatewayStore((s) => s.gateways)
  const gatewayConfig = useGatewayStore((s) => s.config)
  const publishedWorkflows = useLobsterStore((s) => s.publishedWorkflows)
  const publishedWorkflowsStatus = useLobsterStore((s) => s.publishedWorkflowsStatus)
  const publishedWorkflowsError = useLobsterStore((s) => s.publishedWorkflowsError)
  const refreshPublishedWorkflows = useLobsterStore((s) => s.refreshPublishedWorkflows)

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null
  const action = selectedNode ? getAction(selectedNode.data.actionId) : null

  const handleFieldChange = (key: string, value: unknown) => {
    if (!selectedNodeId) return
    updateNodeConfig(selectedNodeId, { [key]: value })
  }

  const workflowRefsList = workflowMeta.bundle?.workflowRefs ?? []
  const workflowRefs = workflowRefsList.join('\n')
  const bundleMode = workflowMeta.bundle?.mode ?? 'single'
  const targetGateway = resolveWorkflowGatewayConfig(workflowMeta, gateways, gatewayConfig)
  const libraryBusy = publishedWorkflowsStatus === 'loading'
  const composerLabel = bundleMode === 'parallel'
    ? 'Parallel Branches'
    : bundleMode === 'chain'
      ? 'Chain Steps'
      : 'Reusable Refs'
  const composerTooltip = bundleMode === 'parallel'
    ? 'Each branch runs a published child workflow through lobster.parallel. The join waits for all branches before the next step runs.'
    : bundleMode === 'chain'
      ? 'Ordered published child workflow refs for a reusable chain. Use Run Sub-Workflow blocks when the parent workflow should execute each child in sequence.'
      : 'Published child workflow refs stored as reusable bundle metadata. Use Block when the parent should execute a child workflow.'

  const setWorkflowRefs = (workflowRefs: string[]) => {
    setWorkflowMeta({
      bundle: {
        ...workflowMeta.bundle,
        workflowRefs,
      },
    })
  }

  const addWorkflowRefValue = (value: string) => {
    const ref = value.trim()
    if (!ref || workflowRefsList.includes(ref)) return
    setWorkflowRefs([...workflowRefsList, ref])
    setWorkflowRefDraft('')
  }

  const removeWorkflowRef = (index: number) => {
    setWorkflowRefs(workflowRefsList.filter((_, i) => i !== index))
  }

  const moveWorkflowRef = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= workflowRefsList.length) return
    const nextRefs = [...workflowRefsList]
    const [ref] = nextRefs.splice(index, 1)
    nextRefs.splice(nextIndex, 0, ref)
    setWorkflowRefs(nextRefs)
  }

  const addWorkflowRef = (workflow: LobsterPublishedWorkflow) => {
    const ref = workflowLibraryRef(workflow)
    if (workflowRefsList.includes(ref)) return
    setWorkflowRefs([...workflowRefsList, ref])
  }

  const addWorkflowBlock = (workflow: LobsterPublishedWorkflow) => {
    addWorkflowRef(workflow)
    addConfiguredNode('run-sub-workflow', {
      x: 80 + nodes.length * 30,
      y: 80 + nodes.length * 120,
    }, {
      target: 'published',
      workflowId: workflow.workflowId,
      workflowRevision: workflow.revision,
      file: '',
      argsJson: '',
      passInput: true,
    })
  }

  const refreshLibrary = () => {
    if (!targetGateway) return
    void refreshPublishedWorkflows({ gatewayConfig: targetGateway })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Workflow metadata */}
      <div className="p-3 border-b border-gray-800">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Workflow</h3>
        <div className="mb-2">
          <label className="block text-xs text-gray-500 mb-1">Name</label>
          <input
            type="text"
            value={workflowMeta.name}
            onChange={(e) => setWorkflowMeta({ name: e.target.value })}
            className="w-full px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-gray-300 placeholder-gray-600 focus:outline-none focus:border-gray-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Description</label>
          <input
            type="text"
            value={workflowMeta.description ?? ''}
            onChange={(e) => setWorkflowMeta({ description: e.target.value })}
            placeholder="Optional description..."
            className="w-full px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-gray-300 placeholder-gray-600 focus:outline-none focus:border-gray-500"
          />
        </div>
        <div className="mt-2">
          <HelpLabel tooltip="Selects the saved gateway for Test Run and Publish. Active gateway means the currently connected gateway is used.">
            Gateway
          </HelpLabel>
          <select
            value={workflowMeta.gateway?.id ?? ''}
            onChange={(e) => {
              const gateway = gateways.find((g) => g.id === e.target.value)
              setWorkflowMeta({
                gateway: gateway ? { id: gateway.id, name: gateway.name } : undefined,
              })
            }}
            className="w-full px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-gray-300 focus:outline-none focus:border-gray-500"
            data-testid="workflow-gateway-select"
          >
            <option value="">Active gateway</option>
            {gateways.map((gateway) => (
              <option key={gateway.id} value={gateway.id}>{gateway.name}</option>
            ))}
          </select>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <HelpLabel tooltip="Schedule metadata for Publish + Cron. The cron job runs inside the OpenClaw Gateway after the workflow is published.">
              Cron
            </HelpLabel>
            <input
              type="text"
              value={workflowMeta.schedule?.cron ?? ''}
              onChange={(e) => setWorkflowMeta({
                schedule: { ...workflowMeta.schedule, cron: e.target.value },
              })}
              placeholder="0 8 * * *"
              className="w-full px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-gray-300 placeholder-gray-600 focus:outline-none focus:border-gray-500"
              data-testid="cron-input"
            />
          </div>
          <div>
            <HelpLabel tooltip="Optional IANA timezone for the cron schedule, such as America/New_York. Leave empty when the gateway default is intended.">
              Timezone
            </HelpLabel>
            <input
              type="text"
              value={workflowMeta.schedule?.timezone ?? ''}
              onChange={(e) => setWorkflowMeta({
                schedule: { ...workflowMeta.schedule, timezone: e.target.value },
              })}
              placeholder="UTC"
              className="w-full px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-gray-300 placeholder-gray-600 focus:outline-none focus:border-gray-500"
              data-testid="timezone-input"
            />
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={workflowMeta.schedule?.enabled ?? false}
              onChange={(e) => setWorkflowMeta({
                schedule: { ...workflowMeta.schedule, enabled: e.target.checked },
              })}
              className="accent-blue-500"
              data-testid="schedule-enabled"
            />
            <span>Schedule enabled</span>
          </label>
          <Tooltip
            content="Changes the action to Publish + Cron. Builder sends schedule metadata to the gateway; channel delivery such as Discord is still configured in OpenClaw."
            side="bottom-left"
            tooltipClassName="w-64"
          >
            <span tabIndex={0} className="inline-flex rounded focus:outline-none focus:ring-1 focus:ring-gray-600">
              <Info size={12} className="text-gray-600" aria-hidden="true" />
            </span>
          </Tooltip>
        </div>
        <div className="mt-3">
          <HelpLabel tooltip="Selects bundle metadata sent to OpenClaw. Chain and library keep ordered child workflow refs; parallel refs compile to a lobster.parallel fan-out step.">
            Bundle Mode
          </HelpLabel>
          <select
            value={bundleMode}
            onChange={(e) => setWorkflowMeta({
              bundle: {
                ...workflowMeta.bundle,
                mode: e.target.value as 'single' | 'chain' | 'parallel' | 'library',
              },
            })}
            className="w-full px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-gray-300 focus:outline-none focus:border-gray-500"
            data-testid="bundle-mode-select"
          >
            <option value="single">Single workflow</option>
            <option value="chain">Chain</option>
            <option value="parallel">Parallel bundle</option>
            <option value="library">Reusable library</option>
          </select>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Flow ID</label>
            <input
              type="text"
              value={workflowMeta.bundle?.id ?? ''}
              onChange={(e) => setWorkflowMeta({
                bundle: {
                  ...workflowMeta.bundle,
                  id: e.target.value,
                },
              })}
              placeholder="daily-support"
              className="w-full px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-gray-300 placeholder-gray-600 focus:outline-none focus:border-gray-500"
              data-testid="flow-id-input"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Bundle Name</label>
            <input
              type="text"
              value={workflowMeta.bundle?.name ?? ''}
              onChange={(e) => setWorkflowMeta({
                bundle: {
                  ...workflowMeta.bundle,
                  name: e.target.value,
                },
              })}
              placeholder="Daily support"
              className="w-full px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-gray-300 placeholder-gray-600 focus:outline-none focus:border-gray-500"
              data-testid="bundle-name-input"
            />
          </div>
        </div>
        <label className="mt-2 flex items-center gap-2 text-xs text-gray-500">
          <input
            type="checkbox"
            checked={workflowMeta.bundle?.reusable ?? false}
            onChange={(e) => setWorkflowMeta({
              bundle: { ...workflowMeta.bundle, reusable: e.target.checked },
            })}
            className="accent-blue-500"
            data-testid="reusable-bundle"
          />
          Reusable bundle
        </label>
        <div
          className="mt-2 rounded border border-gray-800 bg-gray-950/60 p-2"
          data-testid="workflow-ref-composer"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <HelpLabel tooltip={composerTooltip}>
              {composerLabel}
            </HelpLabel>
            {bundleMode === 'parallel' && (
              <Tooltip
                content="Join behavior is fixed to wait for all branches. Each branch ref becomes one lobster.parallel branch in the exported workflow."
                side="bottom-left"
                tooltipClassName="w-64"
              >
                <span
                  tabIndex={0}
                  className="inline-flex items-center gap-1 rounded border border-emerald-900/60 bg-emerald-950/30 px-2 py-1 text-[10px] text-emerald-200 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                  data-testid="parallel-join-summary"
                >
                  <GitBranch size={11} aria-hidden="true" />
                  <span>Join: all</span>
                </span>
              </Tooltip>
            )}
          </div>
          <div className="mb-2 flex gap-1">
            <input
              type="text"
              value={workflowRefDraft}
              onChange={(e) => setWorkflowRefDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addWorkflowRefValue(workflowRefDraft)
                }
              }}
              placeholder="child-flow@2"
              className="min-w-0 flex-1 px-2 py-1 text-xs bg-gray-900 border border-gray-700 rounded text-gray-300 placeholder-gray-600 focus:outline-none focus:border-gray-500"
              data-testid="workflow-ref-draft"
            />
            <Tooltip content={`Add this ref as a ${bundleMode === 'parallel' ? 'parallel branch' : bundleMode === 'chain' ? 'chain step' : 'bundle ref'}.`}>
              <button
                type="button"
                onClick={() => addWorkflowRefValue(workflowRefDraft)}
                disabled={!workflowRefDraft.trim() || workflowRefsList.includes(workflowRefDraft.trim())}
                className="inline-flex h-7 w-7 items-center justify-center rounded text-cyan-300 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                data-testid="workflow-ref-add"
                title="Add workflow ref"
              >
                <Plus size={13} />
              </button>
            </Tooltip>
          </div>
          {workflowRefsList.length === 0 ? (
            <p className="text-[11px] text-gray-600" data-testid="workflow-ref-empty">
              No workflow refs configured.
            </p>
          ) : (
            <div className="space-y-1">
              {workflowRefsList.map((ref, index) => (
                <div
                  key={`${ref}:${index}`}
                  className="flex items-center gap-2 rounded border border-gray-800 bg-gray-900/60 px-2 py-1"
                  data-testid="workflow-ref-row"
                >
                  <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-gray-800 text-[10px] text-gray-400">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1 truncate font-mono text-[11px] text-gray-300" title={ref}>
                    {ref}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-0.5">
                    <Tooltip content={`Move ${ref} earlier in the ${bundleMode === 'parallel' ? 'branch list' : 'chain'}.`}>
                      <button
                        type="button"
                        onClick={() => moveWorkflowRef(index, -1)}
                        disabled={index === 0}
                        className="inline-flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-800 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-30"
                        data-testid={`workflow-ref-move-up-${index}`}
                        title="Move up"
                      >
                        <ArrowUp size={12} />
                      </button>
                    </Tooltip>
                    <Tooltip content={`Move ${ref} later in the ${bundleMode === 'parallel' ? 'branch list' : 'chain'}.`}>
                      <button
                        type="button"
                        onClick={() => moveWorkflowRef(index, 1)}
                        disabled={index === workflowRefsList.length - 1}
                        className="inline-flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-800 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-30"
                        data-testid={`workflow-ref-move-down-${index}`}
                        title="Move down"
                      >
                        <ArrowDown size={12} />
                      </button>
                    </Tooltip>
                    <Tooltip content={`Remove ${ref} from this ${bundleMode === 'parallel' ? 'parallel bundle' : 'bundle'}.`}>
                      <button
                        type="button"
                        onClick={() => removeWorkflowRef(index)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded text-red-300 hover:bg-red-950/40 hover:text-red-200"
                        data-testid={`workflow-ref-remove-${index}`}
                        title="Remove ref"
                      >
                        <Trash2 size={12} />
                      </button>
                    </Tooltip>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="mt-2">
          <HelpLabel tooltip="Advanced newline editor for the same workflow refs shown above. This is useful for paste/import cleanup; normal bundle authoring can use the visual rows and published library buttons.">
            Workflow Refs
          </HelpLabel>
          <textarea
            value={workflowRefs}
            onChange={(e) => setWorkflowMeta({
              bundle: {
                ...workflowMeta.bundle,
                workflowRefs: e.target.value.split('\n').map((v) => v.trim()).filter(Boolean),
              },
            })}
            placeholder="child.lobster"
            className="w-full h-14 px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-gray-300 placeholder-gray-600 focus:outline-none focus:border-gray-500 resize-none"
            data-testid="workflow-refs-input"
          />
        </div>
        <div
          className="mt-2 rounded border border-gray-800 bg-gray-950/60 p-2"
          data-testid="workflow-library"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <HelpLabel tooltip="Loads published Lobster workflows from the selected gateway with lobster.workflow.list. Use Ref for bundle metadata, or Block when the parent workflow should execute the child.">
              Published Library
            </HelpLabel>
            <Tooltip content="Refresh published workflows from the selected gateway.">
              <button
                type="button"
                onClick={refreshLibrary}
                disabled={!targetGateway || libraryBusy}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-800 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
                data-testid="workflow-library-refresh"
                title="Refresh published workflows"
              >
                <RefreshCw size={12} className={libraryBusy ? 'animate-spin' : ''} />
              </button>
            </Tooltip>
          </div>
          {!targetGateway ? (
            <p className="text-[11px] text-gray-600">Select or connect a gateway to load published workflows.</p>
          ) : publishedWorkflowsError ? (
            <p className="text-[11px] text-red-300" data-testid="workflow-library-error">{publishedWorkflowsError}</p>
          ) : publishedWorkflows.length === 0 ? (
            <p className="text-[11px] text-gray-600">No published workflows loaded.</p>
          ) : (
            <div className="space-y-1">
              {publishedWorkflows.map((workflow) => {
                const ref = workflowLibraryRef(workflow)
                const label = workflowLibraryLabel(workflow)
                const alreadyAdded = workflowRefsList.includes(ref)
                return (
                  <div
                    key={`${workflow.workflowId}:${workflow.revision ?? 'latest'}`}
                    className="flex items-center justify-between gap-2 rounded border border-gray-800 bg-gray-900/60 px-2 py-1"
                    data-testid="workflow-library-row"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-medium text-gray-300">{label}</div>
                      <div className="truncate font-mono text-[10px] text-gray-500">
                        {ref}
                        {workflow.bundleMode ? ` · ${workflow.bundleMode}` : ''}
                        {workflow.reusable ? ' · reusable' : ''}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      <Tooltip content={`Add ${ref} to bundle workflow refs.`}>
                        <button
                          type="button"
                          onClick={() => addWorkflowRef(workflow)}
                          disabled={alreadyAdded}
                          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] text-cyan-300 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                          data-testid={`workflow-library-add-ref-${workflow.workflowId}`}
                        >
                          <Plus size={10} />
                          <span>Ref</span>
                        </button>
                      </Tooltip>
                      <Tooltip content={`Create a Run Sub-Workflow block for ${ref}.`}>
                        <button
                          type="button"
                          onClick={() => addWorkflowBlock(workflow)}
                          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] text-blue-300 hover:bg-gray-800"
                          data-testid={`workflow-library-add-block-${workflow.workflowId}`}
                        >
                          <ListPlus size={10} />
                          <span>Block</span>
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Node config */}
      <div className="flex-1 overflow-y-auto p-3">
        {!selectedNode ? (
          <div className="text-center py-8">
            <p className="text-xs text-gray-600">Select a node to configure it</p>
          </div>
        ) : !action ? (
          <div className="text-center py-8">
            <p className="text-xs text-red-400">Unknown action: {selectedNode.data.actionId}</p>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <h3 className="text-xs font-semibold text-gray-300">{action.name}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{action.description}</p>
              {action.requiredTools && action.requiredTools.length > 0 && (
                <Tooltip
                  content={`Requires the invoking agent to allow ${action.requiredTools.map((tool) => `\`${tool}\``).join(' and ')}.`}
                  side="bottom-left"
                  tooltipClassName="w-64"
                >
                  <div
                    tabIndex={0}
                    className="mt-2 inline-flex items-center gap-1 rounded border border-cyan-900/70 bg-cyan-950/40 px-2 py-1 text-[11px] text-cyan-200 focus:outline-none focus:ring-1 focus:ring-cyan-700"
                    data-testid="action-required-tools"
                  >
                    <Info size={11} aria-hidden="true" />
                    <span>Requires {action.requiredTools.join(' + ')}</span>
                  </div>
                </Tooltip>
              )}
            </div>
            <div className="border-t border-gray-800 pt-3">
              {action.configFields.length === 0 ? (
                <p className="text-xs text-gray-600">No configuration required.</p>
              ) : (
                action.configFields.map((field) => (
                  <ConfigField
                    key={field.id}
                    field={field}
                    value={selectedNode.data.config[field.id] ?? field.defaultValue}
                    onChange={(value) => handleFieldChange(field.id, value)}
                  />
                ))
              )}
            </div>
            <div className="mt-4 pt-3 border-t border-gray-800">
              <p className="text-xs text-gray-600">Node ID: <span className="font-mono">{selectedNodeId}</span></p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
