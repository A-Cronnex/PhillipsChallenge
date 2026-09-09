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
 * | TranslatePsy-EuroNano es→en       | `BERGAMOT_ES_EN` (+ `_LEX`, `_VOCAB`)        |
 * | TranslatePsy-EuroNano en→es       | `BERGAMOT_EN_ES` (+ `_LEX`, `_VOCAB`)        |
 * | Whisper STT                       | `WHISPER_BASE_Q8_0`                          |
 *
 * Notes that cost time to rediscover:
 *
 * - MedPsy is registered under `HEALTHCARE_*`, not `MEDPSY_*`.
 * - `VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M` resolves to the **Flash** build,
 *   which is the variant docs/tech-stack.md §6 recommends. The non-Flash build
 *   is the `_1`-suffixed duplicate constant.
 * - TranslatePsy-EuroNano is Bergamot NMT under the hood
 *   (docs/tech-stack.md §7.2), so its registry entries are named `BERGAMOT_*`,
 *   and each direction needs three files: the model, its lexical shortlist and
 *   its vocabulary.
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
  translationEsEnLex: 'BERGAMOT_ES_EN_LEX',
  translationEsEnVocab: 'BERGAMOT_ES_EN_VOCAB',
  /** English → Spanish, for follow-up questions shown to the user. */
  translationEnEs: 'BERGAMOT_EN_ES',
  translationEnEsLex: 'BERGAMOT_EN_ES_LEX',
  translationEnEsVocab: 'BERGAMOT_EN_ES_VOCAB',
  /** Speech-to-text. Size not decided (docs/ai-agent.md §12). */
  speech: 'WHISPER_BASE_Q8_0',
} as const;

export type ModelRole = keyof typeof MODEL_REGISTRY_NAMES;

/**
 * Model distribution is an open decision (docs/ai-agent.md §12): bundled with
 * the build versus downloaded on first run. Nothing here assumes either — the
 * runtime asks QVAC to load by registry name and lets the SDK resolve where
 * the weights come from.
 */
export const MODEL_DISTRIBUTION_DECIDED = false;
