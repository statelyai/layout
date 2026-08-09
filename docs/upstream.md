# Upstream and provenance

## Compatibility baselines

<!-- dependency versions derived from package.json -->

- Public graph model: `@statelyai/graph` 2.1.x
- Runtime oracle: `elkjs` 0.11.x
- Algorithm reference: Eclipse Layout Kernel

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

## Upstream snapshot

The initial architectural review used Eclipse Layout Kernel commit
`8aaa3c145c2a18a38aabbc725aa3791ddc517a76` from 2026-08-05. This is a
research reference, not yet a vendored or translated source snapshot.
