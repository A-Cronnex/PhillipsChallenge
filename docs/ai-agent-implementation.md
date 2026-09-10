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

## 2. Node 24 build baseline

`@qvac/sdk/expo-plugin` is ESM-only, and Expo's config-plugin resolver loads
plugins with `require()`. On Node 18 `npx expo prebuild` fails with:

```
PluginError: Unable to resolve a valid config plugin for @qvac/sdk/expo-plugin.
Error [ERR_REQUIRE_ESM]: require() of ES Module .../expo/plugins/index.js
```

Verified: the same command succeeds on Node 24. `package.json` now declares
`"engines": { "node": ">=24" }`, with `.nvmrc` set to 24. Use `nvm use 24` before any Expo command.

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

## 4. Integration completed on September 9, 2026

The es→en working-copy bridge and en→es follow-up translation are now wired.
Bergamot directions are specified in `loadModel.modelConfig`; `translate()`
uses `modelType: 'nmtcpp-translation'`, and its `.text` is awaited. MedPsy gets
both original input and transient English context; the language guard still
checks values against the original Spanish utterance.

The adapter derives its API type from the installed SDK, replacing the former
hand-written interface and `as never` casts. This exposed two actual mismatches:
`completion().text` is a promise, and transcription accepts `audioChunk`, not
`path`. Vision now loads `projectionModelSrc` with the main model. File URIs are
converted to absolute filesystem paths before inference.

Registry descriptors trigger first-use downloads and reuse local model storage.
They do not bundle the model weights in the APK. Text loads at preparation;
translation, speech and vision load on demand. First use of every modality must
happen online before field work. Quality, latency and memory remain device checks.

Voice recording is connected through expo-audio. Camera/audio cache files are
copied to private document storage before saving references. The orchestrator
checkpoints inputs before inference, including audio before transcription.
`conversation_drafts` holds local JSON snapshots; the latest conversation is
restored after restart. Snapshots/raw media are not uploaded by the sync protocol.

The review screen permits editing values and confidence, selecting or creating a
site, and selecting an existing equipment record or creating a new one. Explicit
confirmation validates the observation and commits equipment, conversation,
observation, attribute confidence, sources and synchronization rows atomically.
Repeated confirmation of the same conversation does not duplicate observations.
Corrected fields become user-reported text; unchanged fields retain provenance.
Original turns plus a final review turn preserve the audit trail.

See [implementation-status.md](implementation-status.md) and the
[Android installation guide](android-installation.md) for the complete integration.

## 5. Layering

```
app/(tabs)/capture/index.tsx            route: resolves user, passes the
                                        runtime factory unresolved
features/conversations/ui/              CaptureLauncher, ConversationScreen,
                                        useConversation
features/conversations/application/     orchestrator, ports (AiRuntime)
features/conversations/domain/          conversation, fields, vision-flow,
                                        extraction, value-rules, language,
                                        confidence
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
- **`expo-audio`** for voice recording, chosen for the same reason.
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

### 8.1 Three stages, not one

`docs/ai-agent.md` §8 lists nine things validation must cover. They are checked
in three stages, in this order, all of them before anything becomes domain
state:

| Stage | Module | Covers |
|---|---|---|
| Shape | `domain/extraction.ts` | data types, allowed enumerations, status values, confidence values, field names |
| Business rules | `domain/value-rules.ts` | numeric ranges, geographic values, text limits |
| Language | `domain/language.ts` | free text is the user's own words (`docs/tech-stack.md` §7.2) |

They are separate because they fail for different reasons: a malformed payload
means the model misunderstood the contract, an installation year of 3025 means
it understood the contract and hallucinated inside it, and "Panama City" for
"Ciudad de Panamá" means it did its job and translated.

Each stage drops what it refuses and reports it; `TurnResult.rejected` is the
concatenation of all three. `useConversation` now renders a validation notice when values were rejected;
the user can inspect and correct the proposal in the review screen.

Persistence reuses `validateObservationDraft`. Duplicate detection rejects a new
equipment record with the same site, brand, model and modality, using trimmed,
case-insensitive SQLite comparison, and asks the user to select the existing
record. This is a conservative MVP matching rule, not fuzzy asset reconciliation.
Site creation similarly checks name + city + country. Neither rule merges data
silently. SQLite's built-in `lower` does not implement full Unicode folding.

### 8.2 Proposed rules introduced here

Flagged the same way `REQUIRE_IDENTIFYING_ATTRIBUTE` is, because the
documentation does not state them. Each is a one-line change:

| Rule | Where | Why |
|---|---|---|
| `MAX_QUANTITY = 10 000`, `MAX_YEARS_OF_USE = 100` | `value-rules.ts` | §8 requires numeric ranges; the database has only lower bounds, which does not catch "1200000 monitors" |
| `MAX_NOTES_LENGTH = 2 000`, `MAX_LABEL_LENGTH = 200` | `value-rules.ts` | guards against a model returning its reasoning as a field value |
| Place names contain no digits | `value-rules.ts` | the strongest "geographic value" check available with no offline gazetteer (CLAUDE.md §18) |
| An `estimated` value cannot be `high` confidence | `domain/confidence.ts` | the two claims contradict each other; the cap only ever lowers a claim |
| `MAX_DIRECT_ANSWER_LENGTH = 60` | `domain/language.ts` | decides when a short reply *is* the answer to the question just asked |

### 8.3 Confidence (§9)

Per-attribute confidence comes from the model, is validated against
`CONFIDENCE_LEVELS`, capped against its own status, and stored per field in
`ConversationState`. `domain/confidence.ts` turns that into
`attribute_confidence` rows and derives the observation-level value.

The overall rule is **not** reimplemented for the agent: it calls
`deriveOverallConfidence` from `features/observations/domain/confidence.ts`, so
an observation captured by talking and the same one typed into the form cannot
end up rated differently. Fields with no confidence attribute in
`docs/domain-model.md` §7 — quantity, site name, city, country, years of use,
notes — produce no row and do not affect the overall value.

The final review exposes the same `ConfidenceSelector` as manual capture.
The user can amend confidence before confirmation. A separate business workflow
that requires asking a confidence question on every agent turn is not defined.

### 8.4 Free Text Stays in the User's Language (§7.2)

`docs/tech-stack.md` §7.2 and `docs/domain-model.md` §6 require `notes` and
other free-text fields to be persisted in the user's language, with MedPsy's
English as a transient working copy. Enforced in two places:

- **Prompt** (`services/ai/prompts.ts`): the model is told to copy the user's
  own words character for character for the language-sensitive fields, and to
  write the follow-up question in the user's language.
- **Domain** (`features/conversations/domain/language.ts`): the prompt is a
  request, and model output is never trusted (CLAUDE.md §7). For a text or
  voice turn, a language-sensitive value must be found in **what the user
  actually said this turn**, compared with accents, case and punctuation
  folded. There is no language detector: "is this Spanish?" is replaced by
  "did the user write this?", which is decidable offline.

What happens when the check fails:

| Case | Result |
|---|---|
| Value found in the utterance | Replaced by the user's own spelling of it, accents included |
| Not found, field is `notes` | Replaced by the user's whole statement (`docs/ai-agent.md` §6, preserve the original statement) |
| Not found, field is the one just asked about, reply ≤ 60 chars | Replaced by the reply — a short answer to a direct question *is* the value |
| Otherwise | Dropped and reported; the field stays missing and the agent asks again |

Which fields are language-sensitive is
`CAPTURE_FIELD_SPECS[field].languageSensitive`: `notes`, `siteName`, `city`,
`country`, `operationalStatus`, `modality`. `brand` and `model` are excluded —
a manufacturer name and a model number are language-invariant, and they are
exactly what a nameplate photo produces. `modality` is the debatable inclusion:
it is in because migration 001 deliberately stores it as free text with no
controlled vocabulary, so "rayos X" must not become "X-Ray"; revisit if a
canonical modality vocabulary is ever confirmed.

Limits worth knowing:

- The check sees **only the current turn**. That is sound today because
  `TextExtractionRequest` carries no conversation history, so the model cannot
  legitimately produce a value from an earlier turn. If history is ever passed
  to the model, this check has to widen with it or it will start dropping good
  values.
- Image turns are exempt: a nameplate reads the way it is printed and there is
  no utterance to compare against. VisionPsy transcribing a Spanish label into
  English is possible and is **not** caught — `docs/tech-stack.md` §7.2 already
  flags VisionPsy's Spanish behaviour as unverified.
- Substring matching means a model answering "monitor" for a user who said
  "monitores" is accepted, and stores "monitor". That is the user's own word,
  truncated, not a translation.

## 9. Verification

The current counts and commands are in [implementation-status.md](implementation-status.md).
Tests cover extraction, language preservation, confidence, vision flow, input
checkpoints, review validation, source preservation and SDK request/response
shapes. The SQLite integration test exercises actual migrations and repositories,
rollback, recovery and idempotent finalization.

SDK tests substitute its native implementation. They do not demonstrate model
quality or prove that a particular device has sufficient memory.

## 10. Physical-device acceptance checklist

None of these checks has been executed in this session: ADB detected no phone.
Use [android-installation.md](android-installation.md) to install the app.

- [ ] First-use model download completes; later cached loads work without Internet.
- [ ] MedPsy extracts numbers and identifiers from real field descriptions.
- [ ] Bergamot translates both directions and follow-ups remain Spanish.
- [ ] VisionPsy + projector accepts the retained camera file and reads a nameplate.
- [ ] Poor image → one photo re-request per field → voice suggestion; camera remains available.
- [ ] Voice permissions, recording, stopping and transcription work; backgrounding stops recording.
- [ ] Audio failure preserves the file and allows retry of the last entry after restart.
- [ ] Mixed text/image/voice capture retains each attribute's source and confidence.
- [ ] Review corrections persist; existing equipment receives a new historical observation.
- [ ] Reopening the app restores the last conversation; re-confirming does not duplicate it.
- [ ] Measure model load/inference latency and peak RAM alongside MapLibre.
- [ ] Validate text, photos and voice in airplane mode using an autonomous APK.
- [ ] Validate expo-sqlite foreign keys, persistence and transaction rollback on Android.
- [ ] Validate MapLibre rendering, site taps and offline region download with self-hosted resources.
- [ ] Test configured HTTPS synchronization, expired/revoked credentials and retry after connection loss.
