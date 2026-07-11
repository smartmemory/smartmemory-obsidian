---
type: decision
title: Choose PostgreSQL
resource: smartmemory://team-a/dec-2
tags:
  - architecture
smartmemory:
  lifecycle:
    status: superseded
  edges:
    - type: SUPERSEDES
      target: smartmemory://team-a/dec-1
      properties:
        reason: Reconsidered after scaling review.
  decision:
    decision_type: choice
    source_type: explicit
---

Use PostgreSQL for the primary datastore.

## Relations

- [SUPERSEDES](smartmemory://team-a/dec-1)
