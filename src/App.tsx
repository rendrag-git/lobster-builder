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
import { downloadWorkflow, downloadBuilderState, importFromFile } from './lib/file-io'
import { Upload, Download, FileJson, LayoutTemplate, Sun, Moon, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react'

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

function Toolbar({ onShowTemplates, onShowGateway, isDark, onToggleDark, sidebarOpen, onToggleSidebar, rightPanelOpen, onToggleRightPanel }: ToolbarProps) {
  const { nodes, edges, workflowMeta, setWorkflowMeta, setNodes, setEdges } = useWorkflowStore()
  const gatewayStatus = useGatewayStore((s) => s.status)

  const statusDotColor: Record<typeof gatewayStatus, string> = {
    connected: 'bg-green-500',
    connecting: 'bg-yellow-500 animate-pulse',
    error: 'bg-red-500',
    disconnected: 'bg-gray-600',
  }
  const nodeCount = nodes.length
  const edgeCount = edges.length

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
          title="Export as .lobster YAML"
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-400 hover:text-gray-100 hover:bg-gray-800 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download size={12} />
          Export YAML
        </button>
        <button
          onClick={handleExportProject}
          disabled={nodes.length === 0}
          title="Export builder project as JSON"
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

type RightTab = 'config' | 'yaml'

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
          onClick={() => setActiveTab('yaml')}
          data-testid="yaml-preview-tab"
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            activeTab === 'yaml'
              ? 'text-white border-b-2 border-blue-500 bg-gray-800/40'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          YAML
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
