# AI Agent — Implementation Notes

Companion to `docs/ai-agent.md` (what the agent must do) and
`docs/tech-stack.md` §6 (which runtime). This records what was actually built,
what was verified, and what cannot be verified without a physical device.

## 1. Installed

| Package | Version | Note |
|---|---|---|
| `@qvac/sdk` | 0.19.0 | Local inference |
| `react-native-bare-kit` | 0.15.0 | `docs/tech-stack.md` §6 says `^0.11.5` — **stale**, see §7 |
| `bare-pack` (dev) | 2.2.2 | §6 says `^1.5.1` — **stale**, see §7 |
| `expo-file-system`, `expo-device`, `expo-build-properties` | SDK 54 | QVAC peer deps |
| `expo-image-picker` | 17.0.11 | **New decision**, see §7 |
| `expo-audio` | 1.1.1 | **New decision**, see §7 |

`app.json` plugins, in order: `expo-router`, `expo-sqlite`,
`@maplibre/maplibre-react-native`,
`["expo-build-properties", { "android": { "minSdkVersion": 29 } }]`,
`@qvac/sdk/expo-plugin`, `expo-audio`, `expo-image-picker` (with Spanish
permission strings that state the photo never leaves the device).

## 2. Node ≥ 20.17 Is Now Required

`@qvac/sdk/expo-plugin` is ESM-only, and Expo's config-plugin resolver loads
plugins with `require()`. On Node 18 `npx expo prebuild` fails with:

```
PluginError: Unable to resolve a valid config plugin for @qvac/sdk/expo-plugin.
Error [ERR_REQUIRE_ESM]: require() of ES Module .../expo/plugins/index.js
```

Verified: the same command succeeds on Node 24. `package.json` now declares
`"engines": { "node": ">=20.17" }`. Use `nvm use 24` before any Expo command.

## 3. Model Identifiers

`docs/tech-stack.md` §6 names the models by marketing name; the QVAC registry
uses different constants. The mapping is in `services/ai/models.ts` and was
read out of the installed `@qvac/inference/models`:

| §6 name | Registry constant |
|---|---|
| MedPsy-1.7B Q4_K_M | `HEALTHCARE_1_7B_MEDICAL_Q4_K_M` |
| VisionPsy-Nano-460M-Flash Q4_K_M | `VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M` |
| VisionPsy projector | `MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0` |
| TranslatePsy-EuroNano es→en | `BERGAMOT_ES_EN` + `_LEX` + `_VOCAB` |
| TranslatePsy-EuroNano en→es | `BERGAMOT_EN_ES` + `_LEX` + `_VOCAB` |
| Whisper | `WHISPER_BASE_Q8_0` (size **not** decided) |

Three things that cost time to rediscover:

- MedPsy is registered under `HEALTHCARE_*`, not `MEDPSY_*`.
- `VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M` is the **Flash** build; the non-Flash
  build is the `_1`-suffixed duplicate.
- TranslatePsy-EuroNano is Bergamot NMT (`docs/tech-stack.md` §7.2), so it
  appears as `BERGAMOT_*` and each direction needs three files.

## 4. What Is NOT Wired Yet

**The Spanish→English translation bridge is not applied.**
`docs/tech-stack.md` §7.2 specifies es → MedPsy(en) → es. The Bergamot model
constants are recorded but `createQvacRuntime` prompts MedPsy directly with the
user's text. Consequences:

- Extraction quality on Spanish input is unmeasured. It may be fine (MedPsy has
  seen Spanish) or poor — that is a device measurement, not a guess.
- Nothing is corrupted by this: the user's original text is what gets persisted
  either way, which is what §7.2 actually requires of storage.

Wiring it means calling `translate({ modelId, text, from:'es', to:'en' })`
before the completion and again in reverse for the follow-up question. Deferred
because it doubles the loaded-model count, and whether it is needed at all
should be decided by measuring Spanish extraction on a device first (§6).

**Also not implemented:** persisting a conversation to the `conversations`
table, converting a completed conversation into an `Observation`, and voice
recording (`expo-audio` is installed and `transcribe()` is wired, but no
recorder UI exists — the agent accepts text and photos today).

## 5. Layering

```
app/(tabs)/conversations/index.tsx      route: resolves user + runtime
features/conversations/ui/              ConversationScreen, useConversation
features/conversations/application/     orchestrator, ports (AiRuntime)
features/conversations/domain/          conversation, fields, vision-flow, extraction
        ↓ AiRuntime (interface)
services/ai/                            qvac-runtime, prompts, models
lib/ai-runtime.ts                       the ONLY file that imports @qvac/*
```

`@qvac/*` is imported in exactly one place, and dynamically, so the router does
not pull in the Bare runtime at startup. `services/ai/qvac-runtime.ts` takes
the SDK as a structural parameter rather than importing it, which is what makes
the adapter testable at all.

## 6. §3a Vision Flow

Encoded as a pure decision function in
`features/conversations/domain/vision-flow.ts`, so the rules are testable
without a device. Each §3a rule and its enforcement point:

| Rule | Enforced by |
|---|---|
| One photo re-request per field, then offer voice | `MAX_PHOTO_REQUESTS_PER_FIELD`, checked in `decideNextAction` |
| Voice is a suggestion, not forced | action is `suggest_voice`; `acceptsMorePhotos` stays true so the camera stays available |
| Confirmed fields are not re-asked | only fields failing `isKnown` are considered; `visionTargetsFor` excludes them |
| Per field, not per observation | decisions are made one field at a time; a conversation can hold image-captured and voice-captured fields at once |

**Which fields a photo can answer** is a judgement encoded in
`CAPTURE_FIELD_SPECS[field].visionReadable`: brand, model, modality and
installation year are on nameplates; quantity, site name, city, country, years
of use and operational status are not. Asking a field user for another photo of
"how many units are in this room" would waste a site visit. This mapping is not
in the documentation — it is a proposal, and the one most likely to need
adjusting after real use.

## 7. Decisions Taken That the Docs Do Not Cover

- **`expo-image-picker`** for photo capture. `docs/ai-agent.md` §3a requires
  photos but no document names a camera package. First-party Expo, covers both
  camera and library.
- **`expo-audio`** for future voice recording, chosen for the same reason.
- **Dependency-version drift**: `docs/tech-stack.md` §6 pins
  `react-native-bare-kit@^0.11.5` and `bare-pack@^1.5.1`. The current
  `@qvac/sdk` peer range is `*` for bare-kit and it depends on `bare-pack@^2`.
  Installed 0.15.0 and 2.2.2 respectively. §6's pins should be updated or
  removed.
- **Prompt contract** (`services/ai/prompts.ts`). `docs/ai-agent.md` §12 lists
  this as undecided. The prompts instruct JSON-only output against the §7
  schema and forbid inventing values, and the output is validated regardless.

## 8. Model Output Is Never Trusted

`features/conversations/domain/extraction.ts` validates everything the model
returns (CLAUDE.md §7, `docs/ai-agent.md` §8):

- A payload that is not an object, or has no `values` array, is rejected whole.
- A single bad entry is dropped and reported in `rejected`, not silently
  discarded — a model that gets nine fields right and hallucinates a tenth
  still contributes the nine, and the tenth leaves a trace.
- Unknown field names are never mapped onto something similar.
- A value reported with status `unknown` has its value discarded
  (`normalizeExtraction`), because §5 says an unknown value is stored as
  unknown, not invented.

Errors deliberately do **not** include the model's raw output: it can contain
the user's own words about a hospital (`docs/ai-agent.md` §14).

## 9. Tests

`npm test` — 193 tests across 16 suites, all passing. For the agent:

- `tests/features/conversations/vision-flow.test.ts` (13) — each §3a rule,
  named after the rule it protects.
- `tests/features/conversations/extraction.test.ts` (16) — invented fields,
  invalid statuses and confidences, non-primitive values, NaN, partial
  salvage, the unknown-value rule.
- `tests/features/conversations/orchestrator.test.ts` (13) — the full §3a
  sequence against a scripted runtime: photo → re-request → voice suggestion;
  mixed image/voice capture in one conversation; inference failure preserving
  the conversation; unusable output fabricating nothing.

**What these do not prove:** that a real model returns anything resembling
these shapes. Every test substitutes a fake `AiRuntime`. QVAC cannot run under
Jest or on an emulator (`docs/ai-agent.md` §12).

## 10. Device Testing Checklist

Everything below needs a **physical device**. Nothing in this list has been
executed. Prerequisites: Node ≥20.17 (`nvm use 24`), then

```bash
npx expo prebuild
npx expo run:android    # or run:ios
```

### 10.1 Blocking — the SDK contract

These are the assumptions most likely to be wrong, because CLAUDE.md §18 lists
the exact QVAC API as unresolved and `services/ai/qvac-runtime.ts` was written
against type definitions, never executed.

1. **Models load at all.** Open the *Agente* tab, press "Cargar modelos".
   Expected: it reaches "ready". If it fails, the message on screen is the
   real error — that tells us whether `loadModel({ modelSrc })` takes a
   registry descriptor the way the adapter assumes.
2. **Model distribution.** Watch whether first load downloads weights or fails
   for missing files. This settles the open question in `docs/ai-agent.md` §12
   (bundled vs. downloaded on first run) with an observation instead of a guess.
3. **`completion()` response shape.** The adapter reads `response.text`. If
   nothing is extracted but no error appears, this is the first suspect.
4. **Image attachments.** Take a photo of an equipment nameplate. The adapter
   passes `attachments: [{ path }]` with the `expo-image-picker` URI. Two things
   can break: VisionPsy may need the mmproj projector loaded explicitly
   alongside the model, and the picker returns a `file://` URI which QVAC may
   or may not accept as a path.

### 10.2 The §3a flow, end to end

5. Photo of a nameplate where the **brand is legible** → brand captured,
   marked as coming from the image.
6. Photo where the **brand is not legible** → agent asks for another photo of
   the nameplate.
7. A second unusable photo → agent suggests voice **and** the camera button is
   still offered (rule 2).
8. Answer by text after the voice suggestion → the field is captured and the
   agent moves on to the next missing field, without re-asking anything already
   captured (rule 3).
9. Mixed session: brand from a photo, quantity and site by typing → both
   recorded with the right `source`, in one conversation (rule 4).

### 10.3 Quality questions only a device can answer

10. **Spanish extraction without the translation bridge** (§4). Speak/type in
    Spanish and judge whether MedPsy extracts correctly. This decides whether
    the Bergamot es↔en bridge is needed or is avoidable complexity.
11. **VisionPsy on Spanish-language nameplates.** `docs/tech-stack.md` §7.2
    flags this as unverified.
12. **Latency.** First-token time for a photo, on the target phone. §6 of
    tech-stack picked the Flash variant for sub-second first token — confirm.
13. **Memory.** MedPsy-1.7B and VisionPsy loaded together, plus MapLibre. If
    they do not coexist, the runtime needs to unload one before loading the
    other (`unloadModel` is available).
14. **`visionReadable` field mapping** (§6). Does asking for a photo of the
    modality actually work, or should it be voice-only?

### 10.4 Non-AI items also pending a device

15. MapLibre rendering, tap hit-testing on site circles, and the site→equipment
    detail panel (`docs/maps.md` §11).
16. `expo-sqlite` opening the real database, and specifically that
    `PRAGMA foreign_keys = ON` takes effect — if it does not, every foreign key
    silently stops being enforced.
17. Offline region download (`docs/maps.md` §5) — only testable once a
    self-hosted style URL exists; with no basemap configured the code correctly
    refuses to start a download.
