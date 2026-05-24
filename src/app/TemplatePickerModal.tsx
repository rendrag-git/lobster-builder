import { X, Workflow, Search, GitBranch, CheckSquare, MessageSquare, Plus } from 'lucide-react'
import { useWorkflowStore } from '../store/workflow-store'
import type { WorkflowNode, WorkflowEdge, WorkflowMeta } from '../types/graph'

interface TemplateData {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  meta: WorkflowMeta
}

interface TemplateCard {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  nodeCount: number
  tags: string[]
  load: () => Promise<TemplateData>
}

function loadTemplate(importer: () => Promise<{ default: TemplateData }>): Promise<TemplateData> {
  return importer().then((m) => m.default)
}

const TEMPLATES: TemplateCard[] = [
  {
    id: 'hello-world',
    name: 'Hello World',
    description: 'A minimal starter that runs a shell command and renders the output.',
    icon: <Workflow size={20} />,
    nodeCount: 2,
    tags: ['starter', 'shell'],
    load: () => loadTemplate(() => import('../templates/hello-world.json')),
  },
  {
    id: 'pr-monitor',
    name: 'PR Monitor',
    description: 'Fetch GitHub PRs, check if any exist, and notify your team on Slack.',
    icon: <GitBranch size={20} />,
    nodeCount: 3,
    tags: ['github', 'notification'],
    load: () => loadTemplate(() => import('../templates/pr-monitor.json')),
  },
  {
    id: 'ai-research',
    name: 'AI Research',
    description: 'Search the web, summarize findings with an LLM, and save to a file.',
    icon: <Search size={20} />,
    nodeCount: 3,
    tags: ['ai', 'llm', 'research'],
    load: () => loadTemplate(() => import('../templates/ai-research.json')),
  },
  {
    id: 'approval-pipeline',
    name: 'Approval Pipeline',
    description: 'Read a file, have an AI agent review it, require human approval, then notify.',
    icon: <CheckSquare size={20} />,
    nodeCount: 4,
    tags: ['approval', 'agent', 'review'],
    load: () => loadTemplate(() => import('../templates/approval-pipeline.json')),
  },
  {
    id: 'native-message-example',
    name: 'OpenClaw Message',
    description: 'Prepare a result, require approval, then send a native OpenClaw channel message.',
    icon: <MessageSquare size={20} />,
    nodeCount: 3,
    tags: ['openclaw', 'message', 'approval'],
    load: () => loadTemplate(() => import('../templates/native-message-example.json')),
  },
]

interface TemplatePickerModalProps {
  onClose: () => void
}

export function TemplatePickerModal({ onClose }: TemplatePickerModalProps) {
  const { setNodes, setEdges, setWorkflowMeta, reset } = useWorkflowStore()

  const handleSelectTemplate = async (template: TemplateCard) => {
    try {
      const data = await template.load()
      reset()
      setNodes(data.nodes)
      setEdges(data.edges)
      setWorkflowMeta(data.meta)
      onClose()
    } catch (err) {
      console.error('Failed to load template:', err)
    }
  }

  const handleBlankCanvas = () => {
    reset()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      data-testid="template-picker"
    >
      <div
        className="w-full max-w-2xl mx-4 rounded-xl border border-gray-700 shadow-2xl"
        style={{ background: '#111827' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div>
            <h2 className="text-base font-semibold text-white">Start with a Template</h2>
            <p className="text-xs text-gray-500 mt-0.5">Choose a starting point or begin with a blank canvas</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Template grid */}
        <div className="p-6 grid grid-cols-2 gap-3">
          {/* Blank canvas option */}
          <button
            onClick={handleBlankCanvas}
            className="flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed border-gray-700 hover:border-gray-500 hover:bg-gray-800/40 transition-all text-gray-500 hover:text-gray-300 group"
            data-testid="template-blank-canvas"
          >
            <Plus size={24} className="group-hover:scale-110 transition-transform" />
            <span className="text-sm font-medium">Blank Canvas</span>
            <span className="text-xs text-gray-600">Start from scratch</span>
          </button>

          {/* Template cards */}
          {TEMPLATES.map((template) => (
            <button
              key={template.id}
              onClick={() => handleSelectTemplate(template)}
              className="flex flex-col gap-3 p-4 rounded-lg border border-gray-700 hover:border-gray-500 hover:bg-gray-800/40 transition-all text-left group"
              data-testid={`template-card-${template.id}`}
            >
              <div className="flex items-start justify-between">
                <div className="p-2 rounded-md bg-gray-800 text-blue-400 group-hover:bg-blue-900/30 group-hover:text-blue-300 transition-colors">
                  {template.icon}
                </div>
                <span className="text-xs text-gray-600 mt-1">
                  {template.nodeCount} {template.nodeCount === 1 ? 'node' : 'nodes'}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors">
                  {template.name}
                </p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  {template.description}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                {template.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-1.5 py-0.5 text-xs rounded bg-gray-800 text-gray-500 font-mono"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
