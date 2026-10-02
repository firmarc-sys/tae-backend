# DeityML 1.0 — UAE Computational Deity Contract

DeityML is the canonical human-readable and machine-readable specification format for the United Agentic Ecosystem pantheon.

## Authority law

TAE is the sole resolver. DeityML describes jurisdiction; it does not choose which deity governs an intention.

Jahorin receives human intention. TAE resolves context, primary jurisdiction, supporting deities, ordering, confidence, and continuity. The resolved deity uses its declared skills and tools. Provider-backed execution routes through ARI. Mercury materializes the result. TAE persists the resulting state.

## Rendering boundary

`src/deities/<Deity>.tsx` is reserved for the real R3F/Three.js/UI manifestation. The DeityML constitution must not contain R3F, shader, camera, DOM layout, or visual styling code.

Perplexity or another authorized rendering agent may refine a canonical manifestation `.tsx` file, but it must treat the matching DeityML document as the behavioral and authority contract and must not rewrite the contract to fit the renderer.

## Required DeityML sections

Every materialized `<deity-spec>` contains:

- `<identity>` — canonical name, origin classification, implementation state.
- `<origin>` — source description and UAE computational translation.
- `<governance>` — primary domain, jurisdictions, and authority flags.
- `<modern-interpretation>` — contemporary systems meaning.
- `<skill-set>` — reasoning/observation/transformation/governance abilities with inputs and outputs.
- `<tool-set>` — executable capabilities, transport, approval status, and ARI path.
- `<computational-machine>` — machine class, computational superpower, abilities, modalities, outputs.
- `<tae>` — activation signals and rules that TAE may use during resolution.
- `<collaboration>` — neighboring authorities for multi-deity councils.
- `<constraints>` — non-negotiable runtime and authority boundaries.
- `<manifestation>` — the corresponding `.tsx` manifestation path and Mercury runtime contract.

## TypeScript representation

The documents remain valid TypeScript by living inside `String.raw` template strings. The XML/HTML-like tags are data, not JSX.

```ts
const spec = String.raw`<deity-spec version="1.0" id="athena" name="Athena">
  <skill-set>
    <skill id="multi-step-planning" mode="reason">
      <description>Multi-step planning within Athena's jurisdiction.</description>
    </skill>
  </skill-set>
</deity-spec>`;
```

`src/pantheon/deitySpecs.ts` materializes one full DeityML document for every entry in `deityRoster.ts`. The 104-entry invariant is checked in code.

## Implementation law for renderers

A renderer may decide *how* a deity manifests, but not *what authority the deity has*. Rendering may add R3F scenes, Three.js materials, GLSL/TSL shaders, native-feeling gestures, animation, audio-reactive motion, spatial controls, and accessibility behavior. Rendering must preserve the persistent Mercury world and must not create a second resolver beside TAE.
