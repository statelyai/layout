# Upstream and provenance

## Compatibility baselines

<!-- dependency versions derived from package.json -->

- Public graph model: `@statelyai/graph` 2.1.x
- Runtime oracle: `elkjs` 0.11.x
- Algorithm reference: Eclipse Layout Kernel

The elkjs 0.11.1 compatibility baseline contains 43 Mocha behaviors across 14
test files. Adapted tests retain their source path, release tag, copyright, and
SPDX header.

The initial tracer bullet is an independent implementation of standard layered
graph techniques. It does not copy ELK source. When an ELK implementation is
ported, the commit, Java source path, original notices, and corresponding
TypeScript files must be recorded here and in source headers.

## Porting rules

1. Preserve algorithm behavior and tests, not Java class structure.
2. Use `@statelyai/graph` entity IDs and fields at the public boundary.
3. Keep indexed mutable working state private to hot algorithm loops.
4. Replace Java metadata/property registries with typed TypeScript options.
5. Add differential fixtures against the matching elkjs/ELK revision.
6. Retain EPL-2.0 copyright and notice obligations for translated source.
7. Benchmark before and after each phase replacement.

## Upstream snapshots

The initial architectural review used Eclipse Layout Kernel commit
`8aaa3c145c2a18a38aabbc725aa3791ddc517a76` from 2026-08-05 as a research
reference.

The first direct Java translations use ELK v0.11.0 commit
`54123e884b1ae743b453260f713b20c9bf5787f2`, matching the ELK baseline shipped
through elkjs 0.11.1:

| Java source/family                                | TypeScript source                                          | Covered behavior                      |
| ------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------- |
| `BoxLayoutProvider.java`                          | `src/box.ts`                                               | SIMPLE packing and priority order     |
| `RandomLayoutProvider.java`                       | `src/random.ts`                                            | Java RNG and seeded node placement    |
| Network simplex and width layerers                | `src/layered/network-simplex.ts`, width layerers           | Layer assignment and width objectives |
| BK, linear-segments, and network-simplex placers  | `src/layered/*node-placement.ts`                           | Layered node placement                |
| Breaking-point wrapping and alternating unzipping | `src/layered/multi-edge-wrapping.ts`, `layer-unzipping.ts` | Graph mutation and route restoration  |
| Spline Bézier control-point calculation           | `src/layered/spline-bezier.ts`                             | Native spline route geometry          |

Translated files retain upstream copyright and SPDX headers. Differential
tests compare their seeded geometry with elkjs.
