# Lobster Builder

A standalone visual drag-and-drop workflow builder that outputs valid Lobster `.lobster` YAML files. Build workflows by connecting action nodes on a canvas, configure each step, and export production-ready Lobster YAML — all in the browser, no backend required.

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## How to Use

1. **Choose a template** — pick a starter from the template picker (or blank canvas).
2. **Drag actions** from the left sidebar onto the canvas.
3. **Connect nodes** by dragging from an output port to an input port.
4. **Configure each node** by clicking it — the right panel shows fields for that action.
5. **Preview YAML** in the "YAML" tab of the right panel; it updates live.
6. **Export** via the toolbar:
   - **Export YAML** — downloads a `.lobster` file ready to run with `lobster run`.
   - **Export Project** — downloads a `.lobster-builder.json` snapshot you can re-import later.
7. **Import** — toolbar "Import" button accepts `.lobster`, `.yaml`, or `.lobster-builder.json`.

## Action Catalog

| Category | Actions |
|----------|---------|
| **AI** | Call Agent, Prompt LLM, Web Search, Web Fetch, Analyze Image |
| **Flow** | Conditional Branch, Require Approval, Delay / Wait, Loop For Each, Error Handler |
| **Data** | Set Variable, Filter Where, Transform Pick, Merge Join, JSON Renderer |
| **I/O** | Run Shell Command, HTTP Request, Read File, Write File, Send Notification |
| **Meta** | Run Sub-Workflow |

## Architecture

```
src/
├── actions/          # 20 action definitions (compile function per action)
│   ├── ai/
│   ├── flow/
│   ├── data/
│   ├── io/
│   ├── meta/
│   ├── registry.ts   # central action registry
│   └── init.ts       # side-effect import to register all actions
├── compiler/
│   ├── compile.ts    # canvas graph → LobsterWorkflowFile (topological sort)
│   ├── decompile.ts  # LobsterWorkflowFile → canvas graph (pattern matching)
│   └── toYaml.ts     # LobsterWorkflowFile → YAML string
├── store/
│   └── workflow-store.ts  # Zustand store (nodes, edges, metadata, selection)
├── lib/
│   └── file-io.ts    # export/import helpers (YAML + builder-state JSON)
├── types/
│   ├── lobster.ts    # LobsterWorkflowFile, LobsterStep
│   ├── actions.ts    # ActionDefinition, ConfigField, PortDefinition
│   └── graph.ts      # WorkflowNode, WorkflowEdge, WorkflowMeta
├── components/       # Reusable UI (ActionNode, ConfigField, etc.)
├── app/              # Page-level components (Canvas, Sidebar, ConfigPanel, etc.)
└── templates/        # Starter workflow JSON files
```

**Data flow:**

```
Sidebar drag → addNode() → Zustand store
                                ↓
                     ReactFlow canvas (nodes + edges)
                                ↓
                    compile() → LobsterWorkflowFile
                                ↓
                    workflowToYaml() → YAML string
                                ↓
                    download as .lobster
```

## Tech Stack

- **React 18** + **TypeScript**
- **React Flow** — canvas and edge routing
- **Zustand** — global state
- **Vite** — build tooling
- **Tailwind CSS** + **shadcn/ui** — styling
- **yaml** (npm) — YAML serialisation

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build → `dist/` |
| `npm test` | Run Vitest unit + integration tests |
| `npm run preview` | Preview production build locally |

## Deployment

The app is a pure static SPA. Deploy the `dist/` folder to any static host.

**Cloudflare Pages:**
```bash
npm run build
npx wrangler pages deploy dist/ --project-name lobster-builder
```

Or connect this repo to Cloudflare Pages for automatic deploys on push to `main`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
