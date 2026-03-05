import { useState } from 'react'
import {
  Bot, Sparkles, Search, Globe, Image, GitBranch, CheckSquare, Clock,
  RotateCw, AlertTriangle, Variable, Filter, Shuffle, Merge, Braces,
  Terminal, Wifi, FileText, Save, Bell, Workflow, ChevronDown, ChevronRight,
} from 'lucide-react'
import { getAllActions } from '../actions/init'
import type { ActionDefinition, ActionCategory } from '../types/actions'
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
}

const CATEGORY_META: Record<ActionCategory, { label: string; color: string; dot: string }> = {
  ai:   { label: 'AI',   color: 'text-purple-400', dot: 'bg-purple-500' },
  flow: { label: 'Flow', color: 'text-blue-400',   dot: 'bg-blue-500' },
  data: { label: 'Data', color: 'text-green-400',  dot: 'bg-green-500' },
  io:   { label: 'I/O',  color: 'text-orange-400', dot: 'bg-orange-500' },
  meta: { label: 'Meta', color: 'text-gray-400',   dot: 'bg-gray-500' },
}

const CATEGORY_ORDER: ActionCategory[] = ['ai', 'flow', 'data', 'io', 'meta']

function ActionItem({ action }: { action: ActionDefinition }) {
  const Icon: LucideIcon = ICON_MAP[action.icon] ?? Terminal
  const meta = CATEGORY_META[action.category]

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/x-lobster-action', action.id)
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-grab hover:bg-gray-700 active:cursor-grabbing transition-colors group"
      title={action.description}
    >
      <Icon size={13} className={`${meta.color} flex-shrink-0`} />
      <span className="text-xs text-gray-300 truncate flex-1">{action.name}</span>
    </div>
  )
}

function CategoryGroup({
  category,
  actions,
}: {
  category: ActionCategory
  actions: ActionDefinition[]
}) {
  const [expanded, setExpanded] = useState(true)
  const meta = CATEGORY_META[category]

  return (
    <div className="mb-1">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-gray-800 rounded-md transition-colors"
      >
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.dot}`} />
        <span className={`text-xs font-semibold uppercase tracking-wider ${meta.color}`}>
          {meta.label}
        </span>
        <span className="text-xs text-gray-600 ml-auto mr-1">{actions.length}</span>
        {expanded ? (
          <ChevronDown size={12} className="text-gray-600" />
        ) : (
          <ChevronRight size={12} className="text-gray-600" />
        )}
      </button>
      {expanded && (
        <div className="ml-1">
          {actions.map((a) => (
            <ActionItem key={a.id} action={a} />
          ))}
        </div>
      )}
    </div>
  )
}

export function Sidebar() {
  const [filter, setFilter] = useState('')
  const allActions = getAllActions()

  const filtered = filter.trim()
    ? allActions.filter(
        (a) =>
          a.name.toLowerCase().includes(filter.toLowerCase()) ||
          a.description.toLowerCase().includes(filter.toLowerCase()),
      )
    : null

  return (
    <aside className="w-64 flex-shrink-0 border-r border-gray-800 bg-gray-900 flex flex-col h-full">
      <div className="p-3 border-b border-gray-800">
        <h1 className="text-sm font-bold text-white mb-1">Lobster Builder</h1>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter actions..."
          className="w-full px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-gray-300 placeholder-gray-600 focus:outline-none focus:border-gray-500"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {filtered ? (
          filtered.length === 0 ? (
            <p className="text-xs text-gray-600 text-center py-4">No actions found</p>
          ) : (
            filtered.map((a) => <ActionItem key={a.id} action={a} />)
          )
        ) : (
          CATEGORY_ORDER.map((cat) => {
            const actions = allActions.filter((a) => a.category === cat)
            if (actions.length === 0) return null
            return <CategoryGroup key={cat} category={cat} actions={actions} />
          })
        )}
      </div>
      <div className="p-2 border-t border-gray-800">
        <p className="text-xs text-gray-600 text-center">Drag actions onto canvas</p>
      </div>
    </aside>
  )
}
