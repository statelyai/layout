# Pele layout comparison

<!-- fixture and preview generation from scripts/preview-pele.ts and test/fixtures/pele-request.ts -->

Both panels use the same graph and explicit dimensions. The left panel runs the
existing native layered engine; the right panel runs the separate Pele engine.
This is library output, not an editor screenshot or an editor integration.

![Compact graph comparison](comparison.png)

The [description and guard example](descriptions-and-guards.svg) retains the
state descriptions and guarded transition cards. These are fixture dimensions,
not measurements captured from the editor. Tests check data preservation,
non-overlapping boxes in four directions, and curve clearance in the request
fixture. They do not establish collision-free routing for every graph.

Regenerate both HTML comparisons, Pele SVGs, and geometry JSON with:

```sh
pnpm exec tsx scripts/preview-pele.ts
```

Outputs appear in `.scratch/pele-preview/`. The PNG is a browser capture of the
compact HTML comparison. The SVG is direct rendering of the current route
sections and label boxes. See `NOTICE.md` for upstream attribution and the local
change that keeps bypass bends outside full label bands for large guard cards.
