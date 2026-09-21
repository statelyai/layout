# Layout Context

This context names the two layout contracts that share one implementation without sharing public graph formats.

## Language

**Layout engine**:
The shared algorithm implementation that computes geometry independently of a caller's graph format.

**Native layout**:
The evolvable layout contract expressed with `@statelyai/graph` values and typed native options.
_Avoid_: Core layout

**ELK compatibility layout**:
The pinned layout contract intended to reproduce the elkjs 0.11.1 interface and behavior.
_Avoid_: Legacy layout, ELK-like layout

**Compatibility policy**:
The adapter-owned defaults and quirks required to reproduce a pinned elkjs version.
_Avoid_: Mode, global flag

## Relationships

- **Native layout** and **ELK compatibility layout** are adapters to one **Layout engine**.
- **ELK compatibility layout** owns its versioned **Compatibility policy**.
- ELK JSON and option names belong only to **ELK compatibility layout**.

## Example dialogue

> **Dev:** "Should this label correction change both contracts?"
> **Domain expert:** "Put the shared algorithm in the **Layout engine**, then keep the exception in the **Compatibility policy** only if **ELK compatibility layout** must preserve a different result from **Native layout**."

## Flagged ambiguities

- "Parity" previously mixed API compatibility, approximate geometry, and exact geometry; ELK compatibility now means exact behavior for the pinned version.
