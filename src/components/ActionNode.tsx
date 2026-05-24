import { memo, useCallback } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  Bot, Sparkles, Search, Globe, Image, GitBranch, CheckSquare, Clock,
  RotateCw, AlertTriangle, Variable, Filter, Shuffle, Merge, Braces,
  Terminal, Wifi, FileText, Save, Bell, Workflow, X,
  MessageCircle, Wrench,
} from 'lucide-react'
import { useWorkflowStore } from '../store/workflow-store'
import { getAction } from '../actions/init'
import type { WorkflowNode } from '../types/graph'
import type { LucideIcon } from 'lucide-react'

const ICON_MAP: Record<string, LucideIcon> = {
  bot: Bot,
  sparkles: Sparkles,
  search: Search,
  globe: Globe,
  image: Image,
  'git-branch': GitBranch,
  'check-square': CheckSquare,
  clock: Clock,
  'rotate-cw': RotateCw,
  'alert-triangle': AlertTriangle,
  variable: Variable,
  filter: Filter,
  shuffle: Shuffle,
  merge: Merge,
  braces: Braces,
  terminal: Terminal,
  wifi: Wifi,
  'file-text': FileText,
  save: Save,
  bell: Bell,
  workflow: Workflow,
  message: MessageCircle,
  wrench: Wrench,
}

const CATEGORY_STYLES: Record<string, { header: string; handleColor: string; borderSelected: string }> = {
  ai:   { header: 'bg-purple-700', handleColor: '#a855f7', borderSelected: '#a855f7' },
  flow: { header: 'bg-blue-700',   handleColor: '#3b82f6', borderSelected: '#3b82f6' },
  data: { header: 'bg-green-700',  handleColor: '#22c55e', borderSelected: '#22c55e' },
  io:   { header: 'bg-orange-700', handleColor: '#f97316', borderSelected: '#f97316' },
  openclaw: { header: 'bg-cyan-700', handleColor: '#06b6d4', borderSelected: '#06b6d4' },
  meta: { header: 'bg-gray-600',   handleColor: '#9ca3af', borderSelected: '#9ca3af' },
}

const DEFAULT_STYLE = { header: 'bg-gray-600', handleColor: '#9ca3af', borderSelected: '#9ca3af' }

function ActionNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const removeNode = useWorkflowStore((s) => s.removeNode)
  const selectNode = useWorkflowStore((s) => s.selectNode)

  const action = getAction(data.actionId)
  const style = CATEGORY_STYLES[action?.category ?? 'meta'] ?? DEFAULT_STYLE
  const IconComponent: LucideIcon = action ? (ICON_MAP[action.icon] ?? Terminal) : Terminal

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      removeNode(id)
    },
    [id, removeNode],
  )

  const handleClick = useCallback(() => {
    selectNode(id)
  }, [id, selectNode])

  return (
    <div
      onClick={handleClick}
      data-testid={`workflow-node-${id}`}
      data-action-id={data.actionId}
      style={{
        minWidth: 180,
        border: `2px solid ${selected ? style.borderSelected : '#374151'}`,
        borderRadius: 8,
        boxShadow: selected ? `0 0 0 2px ${style.borderSelected}40` : '0 4px 12px rgba(0,0,0,0.4)',
        background: '#1f2937',
        cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        position: 'relative',
      }}
    >
      {/* Input handles */}
      {action?.inputs.map((port, i) => (
        <Handle
          key={`in-${port.id}`}
          type="target"
          position={Position.Left}
          id={port.id}
          style={{
            top: `${((i + 1) / (action.inputs.length + 1)) * 100}%`,
            background: style.handleColor,
            width: 10,
            height: 10,
            border: '2px solid #111827',
            borderRadius: '50%',
          }}
        />
      ))}

      {/* Output handles */}
      {action?.outputs.map((port, i) => (
        <Handle
          key={`out-${port.id}`}
          type="source"
          position={Position.Right}
          id={port.id}
          style={{
            top: `${((i + 1) / (action.outputs.length + 1)) * 100}%`,
            background: style.handleColor,
            width: 10,
            height: 10,
            border: '2px solid #111827',
            borderRadius: '50%',
          }}
        />
      ))}

      {/* Header */}
      <div
        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-t-md ${style.header}`}
        style={{ borderRadius: '6px 6px 0 0' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <IconComponent size={13} className="text-white flex-shrink-0" />
          <span className="text-white text-xs font-semibold truncate">
            {action?.name ?? data.actionId}
          </span>
        </div>
        <button
          onClick={handleDelete}
          className="text-white/50 hover:text-white flex-shrink-0 transition-colors nodrag"
          title="Delete node"
        >
          <X size={12} />
        </button>
      </div>

      {/* Body */}
      <div className="px-3 py-2 text-xs text-gray-400">
        {action?.description ? (
          <p className="truncate" style={{ maxWidth: 160 }}>{action.description}</p>
        ) : (
          <p className="text-gray-600 italic">Unknown action</p>
        )}
      </div>
    </div>
  )
}

export default memo(ActionNode)
