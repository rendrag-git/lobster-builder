import { useState } from 'react'
import { Copy, Check, Terminal } from 'lucide-react'
import { useWorkflowStore } from '../store/workflow-store'
import { compileToYaml } from '../compiler/toYaml'

export function YamlPreview() {
  const nodes = useWorkflowStore((s) => s.nodes)
  const edges = useWorkflowStore((s) => s.edges)
  const workflowMeta = useWorkflowStore((s) => s.workflowMeta)

  const [copiedYaml, setCopiedYaml] = useState(false)
  const [copiedCmd, setCopiedCmd] = useState(false)

  let yaml = ''
  let error = ''
  try {
    yaml = compileToYaml(nodes, edges, workflowMeta)
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  const copyYaml = async () => {
    if (!yaml) return
    await navigator.clipboard.writeText(yaml)
    setCopiedYaml(true)
    setTimeout(() => setCopiedYaml(false), 2000)
  }

  const copyCmd = async () => {
    const cmd = `lobster run --file workflow.lobster`
    await navigator.clipboard.writeText(cmd)
    setCopiedCmd(true)
    setTimeout(() => setCopiedCmd(false), 2000)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 flex-shrink-0">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">YAML Preview</span>
        <div className="flex gap-1">
          <button
            onClick={copyCmd}
            title="Copy lobster run command"
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded transition-colors"
          >
            <Terminal size={11} />
            {copiedCmd ? <Check size={11} className="text-green-400" /> : null}
          </button>
          <button
            onClick={copyYaml}
            disabled={!yaml}
            title="Copy YAML"
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded transition-colors disabled:opacity-40"
          >
            {copiedYaml ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
            <span>{copiedYaml ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {error ? (
          <div className="p-3 text-xs text-red-400 font-mono whitespace-pre-wrap">
            Error: {error}
          </div>
        ) : nodes.length === 0 ? (
          <div className="p-3 text-xs text-gray-600 italic">
            Add nodes to the canvas to see YAML output.
          </div>
        ) : (
          <pre className="p-3 text-xs text-gray-300 font-mono whitespace-pre overflow-x-auto leading-relaxed">
            {yaml}
          </pre>
        )}
      </div>
    </div>
  )
}
