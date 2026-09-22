# ELK Box compatibility proof

Both images use the same ELK JSON input, 600 x 400 viewport, 2x scale, and no
direction override. The colored rectangle is the returned root bound.

- `before.svg`: compatibility output before the provider policy; root 80 x 130
  and an invented edge section.
- `after.svg`: elkjs 0.11.1-compatible output; root 95 x 145 and no generated
  edge section.

Fixture: three nodes sized 30 x 20, 50 x 40, and 20 x 60; edge `a -> b`;
`elk.algorithm = box`; all other options use elkjs 0.11.1 defaults.
