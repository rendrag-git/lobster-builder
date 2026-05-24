import { useCallback, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  useReactFlow,
  type NodeTypes,
} from '@xyflow/react'
import { useWorkflowStore } from '../store/workflow-store'
import ActionNode from '../components/ActionNode'

const NODE_TYPES: NodeTypes = {
  workflowNode: ActionNode as NodeTypes['workflowNode'],
}

export function Canvas() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    selectNode,
  } = useWorkflowStore()

  const { screenToFlowPosition } = useReactFlow()
  const containerRef = useRef<HTMLDivElement>(null)

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const actionId = e.dataTransfer.getData('application/x-lobster-action')
      if (!actionId) return

      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      addNode(actionId, position)
    },
    [screenToFlowPosition, addNode],
  )

  const onPaneClick = useCallback(() => {
    selectNode(null)
  }, [selectNode])

  return (
    <div ref={containerRef} className="w-full h-full" data-testid="workflow-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onPaneClick={onPaneClick}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          style: { stroke: '#3b82f6', strokeWidth: 2 },
          animated: true,
        }}
        style={{ background: '#030712' }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#1f2937"
        />
        <Controls
          style={{
            background: '#1f2937',
            border: '1px solid #374151',
            borderRadius: 6,
          }}
          showInteractive={false}
        />
        <MiniMap
          style={{
            background: '#111827',
            border: '1px solid #374151',
            borderRadius: 6,
          }}
          nodeColor={() => '#4b5563'}
          maskColor="rgba(0,0,0,0.4)"
        />
      </ReactFlow>
    </div>
  )
}
