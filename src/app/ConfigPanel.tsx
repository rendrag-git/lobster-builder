import { useWorkflowStore } from '../store/workflow-store'
import { getAction } from '../actions/init'
import { ConfigField } from '../components/ConfigField'

export function ConfigPanel() {
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId)
  const nodes = useWorkflowStore((s) => s.nodes)
  const updateNodeConfig = useWorkflowStore((s) => s.updateNodeConfig)
  const workflowMeta = useWorkflowStore((s) => s.workflowMeta)
  const setWorkflowMeta = useWorkflowStore((s) => s.setWorkflowMeta)

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null
  const action = selectedNode ? getAction(selectedNode.data.actionId) : null

  const handleFieldChange = (key: string, value: unknown) => {
    if (!selectedNodeId) return
    updateNodeConfig(selectedNodeId, { [key]: value })
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
