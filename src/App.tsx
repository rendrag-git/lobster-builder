import { useState, useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './index.css'

import { Sidebar } from './app/Sidebar'
import { Canvas } from './app/Canvas'
import { ConfigPanel } from './app/ConfigPanel'
import { YamlPreview } from './app/YamlPreview'
import { TemplatePickerModal } from './app/TemplatePickerModal'
import { GatewayPanel } from './app/GatewayPanel'
import { useWorkflowStore } from './store/workflow-store'
import { useGatewayStore } from './store/gateway-store'
import { useLobsterStore } from './store/lobster-store'
import { downloadWorkflow, downloadBuilderState, importFromFile } from './lib/file-io'
import { Upload, Download, FileJson, LayoutTemplate, Sun, Moon, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, UploadCloud, Loader2 } from 'lucide-react'
import { Tooltip } from './components/Tooltip'
import { useWorkflowGatewayActions } from './hooks/useWorkflowGatewayActions'
import { gatewayActionErrorLabel, gatewayActionErrorTitle } from './lib/gateway-errors'
import type { LobsterEnvelope } from './lib/lobster-service'

interface ToolbarProps {
  onShowTemplates: () => void
  onShowGateway: () => void
  isDark: boolean
  onToggleDark: () => void
  sidebarOpen: boolean
  onToggleSidebar: () => void
  rightPanelOpen: boolean
  onToggleRightPanel: () => void
}

function deployResultSummary(result: LobsterEnvelope | null): string | null {
  const firstOutput = result?.output?.[0]
  if (!firstOutput || typeof firstOutput !== 'object' || Array.isArray(firstOutput)) return null
  const workflow = firstOutput as Record<string, unknown>
  const workflowId = typeof workflow.workflowId === 'string' && workflow.workflowId.trim()
    ? workflow.workflowId.trim()
    : null
  const revision = typeof workflow.revision === 'number' && Number.isFinite(workflow.revision)
    ? workflow.revision
    : null
  if (!workflowId) return null
  return revision === null ? workflowId : `${workflowId}@${revision}`
}

function Toolbar({ onShowTemplates, onShowGateway, isDark, onToggleDark, sidebarOpen, onToggleSidebar, rightPanelOpen, onToggleRightPanel }: ToolbarProps) {
  const { nodes, edges, workflowMeta, setWorkflowMeta, setNodes, setEdges } = useWorkflowStore()
  const gatewayStatus = useGatewayStore((s) => s.status)
  const gatewayActions = useWorkflowGatewayActions()
  const execStatus = useLobsterStore((s) => s.execStatus)
  const lastError = useLobsterStore((s) => s.lastError)
  const lastResult = useLobsterStore((s) => s.lastResult)
  const lastOperation = useLobsterStore((s) => s.lastOperation)

  const statusDotColor: Record<typeof gatewayStatus, string> = {
    connected: 'bg-green-500',
    connecting: 'bg-yellow-500 animate-pulse',
    error: 'bg-red-500',
    disconnected: 'bg-gray-600',
  }
  const nodeCount = nodes.length
  const edgeCount = edges.length
  const deployedWorkflow = deployResultSummary(lastResult)
  const successLabel = lastOperation === 'deploy'
    ? deployedWorkflow
      ? `Deployed ${deployedWorkflow}`
      : 'Deploy completed'
    : lastOperation === 'run'
      ? 'Test run completed'
      : lastOperation === 'resume'
        ? 'Resume completed'
        : lastOperation === 'schedule'
          ? 'Schedule updated'
          : lastOperation === 'unschedule'
            ? 'Schedule removed'
            : lastOperation === 'status'
              ? 'Status refreshed'
              : 'Gateway action completed'
  const successTitle = lastOperation === 'deploy' && deployedWorkflow
    ? `Published workflow ${deployedWorkflow}`
    : successLabel
  const runningLabel = lastOperation === 'run'
    ? 'Running...'
    : lastOperation === 'resume'
      ? 'Resuming...'
      : lastOperation === 'schedule'
        ? 'Updating schedule...'
        : lastOperation === 'unschedule'
          ? 'Removing schedule...'
          : 'Deploying...'
  const gatewayActionStatus = execStatus === 'running'
    ? { label: runningLabel, className: 'text-yellow-300 border-yellow-700/70 bg-yellow-950/40', title: 'Gateway command is still running.' }
    : execStatus === 'success'
      ? { label: successLabel, className: 'text-green-300 border-green-700/70 bg-green-950/40', title: successTitle }
      : execStatus === 'error'
        ? { label: gatewayActionErrorLabel(lastError), className: 'text-red-300 border-red-700/70 bg-red-950/40', title: gatewayActionErrorTitle(lastError) }
        : execStatus === 'approval'
          ? { label: 'Awaiting approval', className: 'text-yellow-300 border-yellow-700/70 bg-yellow-950/40', title: 'Workflow is waiting for approval.' }
          : null

  const handleImport = () => {
    importFromFile(({ nodes: n, edges: e, meta }) => {
      setNodes(n)
      setEdges(e)
      setWorkflowMeta(meta)
    })
  }

  const handleExportYaml = () => {
    downloadWorkflow(nodes, edges, workflowMeta)
  }

  const handleExportProject = () => {
    downloadBuilderState(nodes, edges, workflowMeta)
  }

  return (
    <div className="flex items-center gap-3 w-full">
      <input
        type="text"
        value={workflowMeta.name}
        onChange={(e) => setWorkflowMeta({ name: e.target.value })}
        className="text-sm font-medium bg-transparent text-gray-300 border-none outline-none focus:text-white min-w-0 w-48"
        placeholder="Workflow name..."
      />
      <span className="text-xs text-gray-600">
        {nodeCount} {nodeCount === 1 ? 'node' : 'nodes'}
        {edgeCount > 0 ? `, ${edgeCount} ${edgeCount === 1 ? 'edge' : 'edges'}` : ''}
      </span>
      <button
        onClick={onShowGateway}
        className="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-gray-800 transition-colors"
        title={`Gateway: ${gatewayStatus}`}
        data-testid="open-gateway-panel"
      >
        <span className={`w-2 h-2 rounded-full ${statusDotColor[gatewayStatus]}`} />
        <span className="text-xs text-gray-500">Gateway</span>
      </button>
      <div className="ml-auto flex items-center gap-1">
        <Tooltip
          content={
            <>
              <span className="block font-medium text-blue-300">
                {gatewayActions.scheduleEnabled ? 'Deploy + Cron' : 'Deploy To Gateway'}
              </span>
              <span className="mt-1 block">
                Sends the current workflow to <span className="font-mono">lobster.workflow.publish</span> on {gatewayActions.targetGatewayLabel}.
              </span>
              <span className="mt-1 block text-gray-500">
                Download YAML only saves a local file. Deploy stores a reusable workflow revision on the gateway.
              </span>
              {gatewayActions.deployDisabledReason ? <span className="mt-1 block text-yellow-300">{gatewayActions.deployDisabledReason}</span> : null}
            </>
          }
          testId="toolbar-deploy-tooltip"
        >
          <button
            onClick={gatewayActions.deploy}
            disabled={!gatewayActions.canDeploy}
            title={gatewayActions.deployDisabledReason ?? `Deploy to ${gatewayActions.targetGatewayLabel}`}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-blue-300 hover:text-blue-200 hover:bg-gray-800 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="toolbar-deploy-btn"
          >
            {gatewayActions.busy ? <Loader2 size={12} className="animate-spin" /> : <UploadCloud size={12} />}
            <span>{gatewayActions.scheduleEnabled ? 'Deploy + Cron' : 'Deploy'}</span>
          </button>
        </Tooltip>
        {gatewayActionStatus ? (
          <span
            className={`max-w-40 truncate rounded border px-2 py-1 text-xs ${gatewayActionStatus.className}`}
            title={gatewayActionStatus.title}
            data-testid="gateway-action-status"
          >
            {gatewayActionStatus.label}
          </span>
        ) : null}
        <button
          onClick={onShowTemplates}
          title="Browse templates"
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-400 hover:text-gray-100 hover:bg-gray-800 rounded transition-colors"
          data-testid="open-templates"
        >
          <LayoutTemplate size={12} />
          Templates
        </button>
        <button
          onClick={handleImport}
          title="Import .lobster or .json file"
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-400 hover:text-gray-100 hover:bg-gray-800 rounded transition-colors"
        >
          <Upload size={12} />
          Import
        </button>
        <button
          onClick={handleExportYaml}
          disabled={nodes.length === 0}
          title="Download local .lobster YAML. This does not deploy to the gateway."
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-400 hover:text-gray-100 hover:bg-gray-800 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download size={12} />
          Download YAML
        </button>
        <button
          onClick={handleExportProject}
          disabled={nodes.length === 0}
          title="Download local Builder project JSON. This does not deploy to the gateway."
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-400 hover:text-gray-100 hover:bg-gray-800 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <FileJson size={12} />
          Save Project
        </button>
        <div className="w-px h-4 bg-gray-700 mx-1" />
        <button
          onClick={onToggleSidebar}
          title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors"
        >
          {sidebarOpen ? <PanelLeftClose size={13} /> : <PanelLeftOpen size={13} />}
        </button>
        <button
          onClick={onToggleRightPanel}
          title={rightPanelOpen ? 'Collapse right panel' : 'Expand right panel'}
          className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors"
        >
          {rightPanelOpen ? <PanelRightClose size={13} /> : <PanelRightOpen size={13} />}
        </button>
        <button
          onClick={onToggleDark}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors"
        >
          {isDark ? <Sun size={13} /> : <Moon size={13} />}
        </button>
      </div>
    </div>
  )
}

type RightTab = 'config' | 'deploy'

function RightPanel() {
  const [activeTab, setActiveTab] = useState<RightTab>('config')

  return (
    <aside className="w-80 flex-shrink-0 border-l border-gray-800 bg-gray-900 flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex border-b border-gray-800 flex-shrink-0">
        <button
          onClick={() => setActiveTab('config')}
          data-testid="config-workflow-tab"
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            activeTab === 'config'
              ? 'text-white border-b-2 border-blue-500 bg-gray-800/40'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Config
        </button>
        <button
          onClick={() => setActiveTab('deploy')}
          data-testid="yaml-preview-tab"
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            activeTab === 'deploy'
              ? 'text-white border-b-2 border-blue-500 bg-gray-800/40'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Deploy
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'config' ? <ConfigPanel /> : <YamlPreview />}
      </div>
    </aside>
  )
}

export default function App() {
  const nodeCount = useWorkflowStore((s) => s.nodes.length)
  const [showTemplates, setShowTemplates] = useState(() => nodeCount === 0)
  const [showGateway, setShowGateway] = useState(false)
  const [isDark, setIsDark] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [rightPanelOpen, setRightPanelOpen] = useState(true)

  // Initialize gateway connection from saved config
  useEffect(() => {
    useGatewayStore.getState().init()
  }, [])

  const theme = isDark
    ? {
        root: 'bg-gray-950 text-gray-100',
        toolbar: 'border-b border-gray-800 bg-gray-900',
      }
    : {
        root: 'bg-gray-100 text-gray-900',
        toolbar: 'border-b border-gray-300 bg-white',
      }

  return (
    <ReactFlowProvider>
      <div className={`flex h-screen w-screen overflow-hidden ${theme.root}`} data-theme={isDark ? 'dark' : 'light'}>
        {/* Left: Action palette */}
        {sidebarOpen && <Sidebar />}

        {/* Center: Canvas */}
        <main className="flex-1 min-w-0 flex flex-col">
          <div className={`h-10 flex-shrink-0 flex items-center px-4 ${theme.toolbar}`}>
            <Toolbar
              onShowTemplates={() => setShowTemplates(true)}
              onShowGateway={() => setShowGateway(true)}
              isDark={isDark}
              onToggleDark={() => setIsDark((v) => !v)}
              sidebarOpen={sidebarOpen}
              onToggleSidebar={() => setSidebarOpen((v) => !v)}
              rightPanelOpen={rightPanelOpen}
              onToggleRightPanel={() => setRightPanelOpen((v) => !v)}
            />
          </div>
          <div className="flex-1 min-h-0">
            <Canvas />
          </div>
        </main>

        {/* Right: Config + YAML */}
        {rightPanelOpen && <RightPanel />}

        {/* Template picker modal */}
        {showTemplates && (
          <TemplatePickerModal onClose={() => setShowTemplates(false)} />
        )}

        {/* Gateway connection panel */}
        {showGateway && (
          <GatewayPanel onClose={() => setShowGateway(false)} />
        )}
      </div>
    </ReactFlowProvider>
  )
}
