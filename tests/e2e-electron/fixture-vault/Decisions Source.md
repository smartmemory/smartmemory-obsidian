---
smartmemory_id: mem-decisions-001
---

# Decisions Source

This note is mapped to SmartMemory item `mem-decisions-001`. The Decisions panel
should call the backend with `provenance_memory_id=mem-decisions-001` and render
the decisions the mock backend returns for that id.

Switching away from this note to [[Lineage Source]] must re-fire the panel's
`active-leaf-change` handler against the **real** Obsidian Workspace.
