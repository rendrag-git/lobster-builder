import { create } from 'zustand'
import {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react'
import type { Connection, NodeChange, EdgeChange } from '@xyflow/react'
import { nanoid } from 'nanoid'
import type { WorkflowNode, WorkflowEdge, WorkflowMeta } from '../types/graph'

interface WorkflowState {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  workflowMeta: WorkflowMeta
  selectedNodeId: string | null

  // Node operations
  addNode: (actionId: string, position: { x: number; y: number }) => void
  removeNode: (id: string) => void
  updateNodeConfig: (id: string, config: Record<string, unknown>) => void

  // Edge operations
  addEdge: (connection: Connection) => void

  // Selection
  selectNode: (id: string | null) => void

  // Metadata
  setWorkflowMeta: (meta: Partial<WorkflowMeta>) => void

  // React Flow event handlers
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void

  // Bulk setters (for decompiler)
  setNodes: (nodes: WorkflowNode[]) => void
  setEdges: (edges: WorkflowEdge[]) => void

  // Reset
  reset: () => void
}

const DEFAULT_META: WorkflowMeta = {
  name: 'Untitled Workflow',
  description: '',
}

export const useWorkflowStore = create<WorkflowState>((set) => ({
  nodes: [],
  edges: [],
  workflowMeta: { ...DEFAULT_META },
  selectedNodeId: null,

  addNode: (actionId, position) =>
    set((state) => ({
      nodes: [
        ...state.nodes,
        {
          id: nanoid(),
          type: 'workflowNode',
          position,
          data: {
            actionId,
            config: {},
          },
        },
      ],
    })),

  removeNode: (id) =>
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
    })),

  updateNodeConfig: (id, config) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id
          ? { ...n, data: { ...n.data, config: { ...n.data.config, ...config } } }
          : n
      ),
    })),

  addEdge: (connection) =>
    set((state) => ({
      edges: addEdge(connection, state.edges),
    })),

  selectNode: (id) => set({ selectedNodeId: id }),

  setWorkflowMeta: (meta) =>
    set((state) => ({
      workflowMeta: { ...state.workflowMeta, ...meta },
    })),

  onNodesChange: (changes) =>
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes) as WorkflowNode[],
    })),

  onEdgesChange: (changes) =>
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
    })),

  onConnect: (connection) =>
    set((state) => ({
      edges: addEdge(connection, state.edges),
    })),

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  reset: () =>
    set({
      nodes: [],
      edges: [],
      workflowMeta: { ...DEFAULT_META },
      selectedNodeId: null,
    }),
}))
