/**
 * QVAC model selection.
 *
 * CLAUDE.md §18 lists "exact QVAC APIs and model versions" as unresolved, and
 * docs/tech-stack.md §6 names the models only by their marketing names. The
 * constants below are the actual registry entries shipped in
 * `@qvac/inference/models`, verified against the installed package — the
 * mapping is not guessable from the documentation:
 *
 * | docs/tech-stack.md §6 name        | QVAC registry constant                       |
 * |-----------------------------------|----------------------------------------------|
 * | MedPsy-1.7B (Q4_K_M)              | `HEALTHCARE_1_7B_MEDICAL_Q4_K_M`             |
 * | VisionPsy-Nano-460M-Flash (Q4_K_M)| `VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M`      |
 * | VisionPsy projector               | `MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0` |
 * | TranslatePsy-EuroNano es→en       | `BERGAMOT_ES_EN`                             |
 * | TranslatePsy-EuroNano en→es       | `BERGAMOT_EN_ES`                             |
 * | Whisper STT                       | `WHISPER_BASE_Q8_0`                          |
 *
 * Notes that cost time to rediscover:
 *
 * - MedPsy is registered under `HEALTHCARE_*`, not `MEDPSY_*`.
 * - `VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M` resolves to the **Flash** build,
 *   which is the variant docs/tech-stack.md §6 recommends. The non-Flash build
 *   is the `_1`-suffixed duplicate constant.
 * - TranslatePsy-EuroNano is Bergamot NMT under the hood
 *   (docs/tech-stack.md §7.2), so its registry entries are named `BERGAMOT_*`.
 *   A direction is **one** registry entry. An earlier version of this comment
 *   claimed each needed three (`BERGAMOT_ES_EN` plus `_LEX` and `_VOCAB`
 *   companions) and the constants were written accordingly; those names do not
 *   exist in the installed registry — it has zero entries ending in `_LEX` or
 *   `_VOCAB` — and the SDK resolves the lexical shortlist and vocabulary from
 *   the parent descriptor itself. The dead constants went unnoticed because
 *   nothing resolved them until the offline asset list below did (2026-09-10).
 * - Every name below must exist in the installed registry. `jest-expo` cannot
 *   import `@qvac/inference/models` (it is ESM and native-adjacent, which is
 *   why the adapter keeps its QVAC imports type-only), so this is checked by
 *   hand rather than by a test:
 *
 *   `node --input-type=module -e "const m = await import('@qvac/inference/models');
 *   for (const n of NAMES) console.log(n, m[n] !== undefined)"` — with NAMES set
 *   to the values of `MODEL_REGISTRY_NAMES` below.
 *
 *   At runtime `services/ai/qvac-runtime.ts` also excludes any name the
 *   registry does not define, so a rename degrades instead of showing a
 *   download that can never complete.
 * - Whisper size is NOT settled. `WHISPER_BASE_Q8_0` is a starting point, not
 *   a decision — docs/ai-agent.md §12 explicitly leaves the STT model open.
 */

/** Marketing names as they appear in docs/tech-stack.md §6. */
export const MODEL_LABELS = {
  text: 'MedPsy-1.7B',
  vision: 'VisionPsy-Nano-460M-Flash',
  translation: 'TranslatePsy-EuroNano (es↔en)',
  speech: 'Whisper',
} as const;

/**
 * Registry constant names. Resolved to `ModelDescriptor`s at load time from
 * `@qvac/inference/models`, so a typo fails at startup rather than silently
 * loading nothing.
 */
export const MODEL_REGISTRY_NAMES = {
  /** Extraction, follow-up questions, confidence scoring (docs/ai-agent.md §9). */
  text: 'HEALTHCARE_1_7B_MEDICAL_Q4_K_M',
  /** Nameplate/label reading (docs/ai-agent.md §3a). */
  vision: 'VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M',
  visionProjector: 'MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0',
  /** Spanish → English, for MedPsy's working copy only. */
  translationEsEn: 'BERGAMOT_ES_EN',
  /** English → Spanish. Currently unused; MedPsy no longer writes prose back. */
  translationEnEs: 'BERGAMOT_EN_ES',
  /** Speech-to-text. Size not decided (docs/ai-agent.md §12). */
  speech: 'WHISPER_BASE_Q8_0',
  speechVad: 'VAD_SILERO_5_1_2',
} as const;

export type ModelRole = keyof typeof MODEL_REGISTRY_NAMES;

/** Registry descriptors download weights on first load and reuse QVAC's local cache. */
export const MODEL_DISTRIBUTION_DECIDED = true;

/**
 * Every set of weights that must be on the device for the app to work with no
 * connectivity, in the order they are fetched.
 *
 * `prepare()` used to load only the text model, while the capture screen told
 * the user "una vez descargados, puedes capturar sin internet". That promise
 * was false: the first photo or voice note in the field would then try to
 * download vision or Whisper weights with no network. This list is what makes
 * the promise true, and what the download indicator counts.
 *
 * `translationEnEs` is deliberately absent: MedPsy no longer produces
 * follow-up questions, so nothing translates back into Spanish
 * (`services/ai/qvac-runtime.ts`). Adding it would make the user wait for
 * weights the app never reads.
 */
export const OFFLINE_MODEL_ASSETS: readonly { name: string; label: string }[] = [
  { name: MODEL_REGISTRY_NAMES.text, label: MODEL_LABELS.text },
  { name: MODEL_REGISTRY_NAMES.vision, label: MODEL_LABELS.vision },
  { name: MODEL_REGISTRY_NAMES.visionProjector, label: `${MODEL_LABELS.vision} · proyector` },
  { name: MODEL_REGISTRY_NAMES.speech, label: MODEL_LABELS.speech },
  { name: MODEL_REGISTRY_NAMES.speechVad, label: `${MODEL_LABELS.speech} · VAD` },
  { name: MODEL_REGISTRY_NAMES.translationEsEn, label: MODEL_LABELS.translation },
];
