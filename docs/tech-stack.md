# Tech Stack

## 1. Purpose

This document records the technology stack for the mobile application and
proposes a backend, consistent with the "Important Unresolved Decisions"
listed in `CLAUDE.md` (section 18).

Decisions here are marked as **Confirmed** or **Proposed — pending
confirmation**. Proposed items must not be treated as final until
explicitly approved, per the project's rule against inventing
architectural decisions.

## 2. Confirmed Decisions

| Area | Decision |
|---|---|
| Mobile framework | React Native via **Expo (managed workflow)** |
| Package manager | **npm** |

## 3. Direct Consequences of "Expo Managed"

These follow directly from the Expo choice rather than being separate
decisions — they are the standard, supported path for a managed Expo
project and are recommended by default:

| Area | Recommendation | Why |
|---|---|---|
| Local database | `expo-sqlite` | Official Expo SDK library, async JSI-based API, works without ejecting. Installed with `npx expo install expo-sqlite` rather than `npm install`, so it resolves to a version compatible with the installed Expo SDK. |
| Navigation | `expo-router` | File-based routing, first-party, maintained alongside Expo SDK releases. |
| Testing | `jest-expo` + React Native Testing Library | The preset Expo projects scaffold by default; keeps unit/component tests aligned with the Expo runtime. |
| Language | TypeScript | Matches the `types/` folder already defined in the project structure. |

Exact version numbers are intentionally omitted here: install with
`npx expo install <package>` at setup time so npm resolves versions
compatible with whatever Expo SDK is current then, instead of pinning
numbers in this document that will drift.

## 4. Maps — MapLibre (Important Compatibility Note)

`@maplibre/maplibre-react-native` requires custom native code (a config
plugin that modifies the iOS Podfile and Android Gradle setup).

**Consequence: this app cannot run inside the plain Expo Go app.** From
the first moment MapLibre is added, development requires a **development
build** (`expo-dev-client`), created via `npx expo prebuild` and
`npx expo run:ios` / `run:android`, or via EAS Build.

This does not contradict the "Expo managed" decision — it's still a
managed Expo project — but it means "install Expo Go and scan a QR code"
is not sufficient for this repo. `docs/setup.md` reflects this.

## 4a. Map Tiles — Self-Hosted Only (Confirmed, No Cloud)

**Constraint: no solution in this project may depend on a third-party
cloud service at runtime**, including for map tiles.

This rules out MapTiler and Stadia Maps as previously listed options —
both require live requests to their cloud infrastructure (with an API
key and usage quota) whenever a user downloads or views a map region.
That is a cloud dependency, regardless of how the map itself renders
offline afterward.

**Confirmed approach:** generate vector tiles offline from OpenStreetMap
data using **Protomaps** or the **OpenMapTiles** toolchain, producing a
`.pmtiles` or `.mbtiles` file per region (e.g. Panama, and neighboring
countries as needed). Distribution options, in order of preference:

1. **Bundled with the app** for the initial/default region — zero
   network dependency at all, works from first launch.
2. **Served from the project's own backend** (§5 below) for additional
   regions the user downloads later — still "your infrastructure," not
   a third-party map SaaS.

This is consistent with MapLibre as the renderer above — MapLibre just
displays whatever tile source you give it; self-hosting only changes
where those tiles come from, not the rendering library.

## 5. Backend — Confirmed: Node.js + PostgreSQL (Option A)

**Confirmed.** Option A below is the decision. The implementation lives in
`server/`, and the endpoint it serves is specified in `docs/sync-api.md`.

What "confirmed" covers: the runtime (Node.js), the central database
(PostgreSQL), and the synchronization endpoint's contract. What it does **not**
cover, and what remains open: the authentication protocol, hosting and
deployment configuration, and backup policy — all still listed in §9.

Two options were considered:

### Option A — Node.js API + PostgreSQL (recommended default)

- Express or Fastify, TypeScript, Postgres as the central database.
- Full control over the synchronization endpoint, conflict resolution
  strategy, and versioning fields (`server_version`, `local_version`)
  defined in `docs/database.md`.
- Higher setup and maintenance cost; you own auth, hosting, and backups.

### Option B — Managed backend-as-a-service (e.g. Supabase)

- Postgres-based, includes auth and row-level security out of the box.
- Faster to stand up an MVP sync endpoint.
- Less control over custom conflict-resolution logic; may need to model
  `sync_records` around the provider's own change-tracking primitives.

**Decision: Option A**, for the reason anticipated above — the conflict
handling in `docs/offline-sync.md` §8 and §11 is specific enough (client-wins,
with the replaced state archived rather than discarded) that modelling it
around a provider's own change-tracking primitives would have meant fitting the
policy to the tool. No web framework was adopted: the endpoint is one path with
one method and is served by Node's built-in `http` module, with the handler
written framework-agnostically so Express or Fastify can be introduced later
without touching it (`server/README.md`).

## 6. Local AI Runtime — QVAC (Confirmed)

QVAC (`@qvac/sdk`, by Tether) is confirmed as the local AI runtime. It is
an open-source, local-first AI SDK with official Expo support, which
fits the "no cloud dependency for capture" requirement directly.

### Why it fits

- Runs entirely on-device: text, voice, and image input never leave the
  phone unless P2P delegation is explicitly enabled (it isn't, for this
  project).
- One SDK covers the inputs the agent needs: LLM text completion,
  multimodal inference (text + images in the same context), and
  speech-to-text (Whisper or NVIDIA Parakeet backend) — matching the
  voice/text/image capture requirement in `docs/ai-agent.md` without
  stitching together separate libraries.
- Built-in RAG workflow, if follow-up-question grounding against prior
  observations is needed later.
- No GPU required; runs inference on CPU if necessary.

### Installation (Expo)

```bash
npm i @qvac/sdk
npm i react-native-bare-kit@^0.11.5
npm i -D bare-pack@^1.5.1
npx expo install expo-file-system expo-build-properties expo-device
```

Add the config plugin to `app.json`:

```json
{
  "expo": {
    "plugins": [
      ["expo-build-properties", { "android": { "minSdkVersion": 29 } }],
      "@qvac/sdk/expo-plugin"
    ]
  }
}
```

Then `npx expo prebuild` to generate native files, same as for MapLibre.

### Critical Constraint: No Emulator Support

QVAC uses `llama.cpp` under the hood, which does not run on iOS
Simulator or Android Emulator. **All local-AI testing must happen on a
physical device.** This has to be planned for in the development
workflow and in `docs/testing.md` — AI contract tests that exercise real
inference cannot run in CI on emulators/simulators; they need a
device-in-the-loop step or a mocked QVAC layer for CI, which is itself
an open decision (see below).

### Requirements

- Expo SDK ≥ 54.
- Physical device for any inference testing.

### Recommended Models (QVAC Psy family)

Tether publishes its own quantized, edge-optimized model family under
QVAC Psy, distinct from generic community GGUF models. Two of them map
directly onto this agent's inputs:

| Capability | Model | Why it fits |
|---|---|---|
| Text extraction / reasoning over the conversation | **MedPsy** (1.7B or 4B, GGUF) | Domain-tuned for medical/clinical text; per Tether's published benchmarks the 1.7B variant outperforms larger general medical models on health-domain reasoning tasks while staying small enough for on-device use. Directly relevant since the agent extracts equipment and clinical-site information, not general chit-chat. |
| Image understanding (nameplates, equipment photos) | **VisionPsy-Nano-460M** (or the **-Flash** variant) | A ~460M-parameter vision-language model built for document understanding and OCR — exactly the "read a nameplate/label in a photo" case in `docs/ai-agent.md` §4. The Flash variant trades a little quality for much lower latency (sub-second first token on recent phones), which matters for a field-capture UX where the user is standing in front of the equipment. |
| Speech-to-text | Whisper (GGUF, via QVAC's built-in backend) | QVAC's SDK ships a Whisper-backed STT path (NVIDIA Parakeet is an alternative backend); this isn't a QVAC Psy model but is loaded the same way through `@qvac/sdk`. |

Recommendation, pending confirmation: **MedPsy-1.7B** for text extraction
(smaller footprint, benchmarked competitively against much larger
models) and **VisionPsy-Nano-460M-Flash** for image capture, both as
Q4_K_M-quantized GGUF for the initial build, upgrading to MedPsy-4B or
the non-Flash Vision variant later only if extraction quality on real
field data proves insufficient.

This does not resolve every open point below — exact quantization
trade-offs per target device and whether models ship bundled with the
app vs. downloaded on first run are still open.

### Still Genuinely Open Within QVAC

Confirming the SDK does not resolve everything `CLAUDE.md` flags:

- Which specific model(s) to load for text extraction vs. speech-to-text
  (GGUF model choice, size/quantization trade-off for target devices).
- Whether CI testing of AI contracts uses a mocked QVAC layer or requires
  a real device runner.
- Model distribution: bundled with the app vs. downloaded on first run
  (QVAC supports P2P model fetch, but that's a separate decision from
  using QVAC itself).

## 7. Internationalization / Multi-Language Support

"Any language" actually means two separate problems with different
answers: the app's own UI text, and the language the AI agent can
understand during capture. Treating them as one problem overstates what
the AI side can realistically deliver offline.

### 7.1 UI Text — Genuinely Solvable for Any Language

**Confirmed as recommended:** `expo-localization` (reads the device's
language setting) + `react-i18next` (translation strings, pluralization,
`useTranslation()` hook). This is the standard, first-party-adjacent
combination for Expo apps and scales to as many languages as you have
translation files for — adding a language is a JSON file, not a code
change. RTL languages (Arabic, Hebrew) need `I18nManager` layout
handling, which this stack supports.

```bash
npx expo install expo-localization react-i18next i18next
```

This part of "any language" is not a hard problem — it's translator
availability and ongoing string maintenance, not a technical blocker.

### 7.2 AI Agent Language — Confirmed Scope: Spanish (+ English native)

Language scope is now confirmed as **Spanish input, translated to
English for MedPsy, with responses translated back to Spanish**. English
input needs no translation step, since MedPsy is natively English.

This does not eliminate MedPsy. TranslatePsy-EuroNano and MedPsy run on
different QVAC SDK backends and do fundamentally different jobs:

| | TranslatePsy-EuroNano | MedPsy |
|---|---|---|
| Engine | Bergamot NMT (Marian, seq2seq) | Fabric LLM (`llama.cpp`-based) |
| Job | Sentence-level translation only | Reasoning, follow-up questions, structured extraction, confidence scoring |
| Can produce the JSON shape in `docs/ai-agent.md` §7? | No | Yes |

TranslatePsy cannot replace MedPsy — it has no instruction-following or
extraction capability, only translation. The two are a **pipeline**, not
alternatives: translate → reason/extract → translate back.

- **Speech-to-text (Whisper):** unaffected, already handles Spanish
  natively.
- **Text extraction/reasoning (MedPsy):** still required; receives
  English text only, either the user's native English input or the
  Spanish input translated by the bridge below.
- **Translation bridge:** since scope is Spanish-only (not all 9
  EuroNano languages), only the **es↔en direction pair** needs to be
  bundled, not the full 9-language EuroNano set. Per Tether's published
  figures, a single direction pair can be as small as **~36 MB**
  quantized — smaller than the ~89 MB full 9-language bundle mentioned
  previously, since only one language pair is loaded instead of nine.

Pipeline, concretely:

```
User speaks/types in Spanish
        ↓
Whisper (STT, if voice) — Spanish audio → Spanish text
        ↓
Spanish text preserved as-is for storage (see below)
        ↓
TranslatePsy-EuroNano (es → en) — working copy only, for MedPsy
        ↓
MedPsy — extraction, follow-up question generation, confidence
        ↓
TranslatePsy-EuroNano (en → es) — for follow-up questions shown to the user
        ↓
Structured JSON: field values and notes stored in the user's original
language (Spanish); English is only MedPsy's internal working copy and
is not persisted as the source of truth
```

Confirmed: **`notes` and other free-text fields are stored in the
user's preferred language**, not in the English text MedPsy reasoned
over. This means the translation step must keep the original-language
text around for persistence, separate from the English copy sent to
MedPsy for reasoning — the English copy is transient/working-memory
only, not written to the database.

- **Image/OCR (VisionPsy):** language support for Spanish text in
  photographed nameplates/labels has not been verified in what Tether
  publishes; still unconfirmed, test against real Spanish-language
  equipment labels before relying on it.

## 8. Synchronization Conflict Policy (Confirmed: Client-Wins)

When the same record changed both on-device and on the server, the
**device version wins**; the server is updated to match on next sync.
Full rationale, and the caveat about device-vs-device (not
device-vs-server) conflicts, is documented in `docs/offline-sync.md`
§8 — this is not a footnote, read it before implementing the sync
endpoint, since it affects how `Equipment` records are handled
differently from `Observation` records.

## 9. Still Open (do not invent)

Carried over from `CLAUDE.md` §18 and not resolved by this document:

- Authentication protocol.
- Bluetooth protocol.
- Production deployment configuration.
- Data retention policy.
- Encryption implementation.

## 10. Open Question Raised by the Latest Dataset Note

The sample payload shared for intermediate prompts includes fields not
present in `docs/domain-model.md` or `docs/ai-agent.md` — notably
`observer`, `blockchain_hash`, `replacement_opportunity`, and
`follow_up_prompt`. `blockchain_hash` in particular implies a technology
decision (some form of ledger or hashing/verification layer) that isn't
covered anywhere in the current stack.

This document does not add blockchain to the stack. If that field is a
real requirement, it needs its own confirmed decision (what produces the
hash, where it's stored, why) before it's added to `docs/domain-model.md`
or the database schema.
