/**
 * The information a capture conversation is trying to collect
 * (docs/ai-agent.md §4).
 *
 * Each field also records whether a photograph can plausibly show it. That is
 * what makes the vision-first flow in §3a decidable: the agent must know which
 * missing fields are worth asking for another photo of, and which can only
 * come from the user speaking or typing.
 */

export const CAPTURE_FIELDS = [
  'quantity',
  'siteName',
  'country',
  'city',
  'brand',
  'model',
  'modality',
  'estimatedYearsOfUse',
  'estimatedInstallationYear',
  'operationalStatus',
  'notes',
] as const;

export type CaptureField = (typeof CAPTURE_FIELDS)[number];

export interface CaptureFieldSpec {
  field: CaptureField;
  /** Whether the observation cannot be completed without it. */
  required: boolean;
  /**
   * Domain shape of the value, so that business-rule validation of model
   * output (docs/ai-agent.md §8) can be driven from the field catalogue
   * instead of a second list that would drift from this one.
   * See `value-rules.ts`.
   */
  kind: 'text' | 'integer';
  /**
   * Whether the value is free text that must be persisted in the user's own
   * language (docs/tech-stack.md §7.2, docs/domain-model.md §6 "Language of
   * Free-Text Fields").
   *
   * MedPsy reasons in English, so anything it *writes* may come back
   * translated. For these fields the model's job is to locate the value in
   * what the user said, not to produce it — `language.ts` enforces that.
   *
   * `brand` and `model` are excluded on purpose: a manufacturer name and a
   * model number are language-invariant identifiers, and they are exactly the
   * values a nameplate photo produces, where there is no user utterance to
   * check against.
   *
   * `modality` is the debatable one. It is included because the database
   * stores it as free text with no controlled vocabulary yet (migration 001
   * deliberately has no CHECK on it), so "rayos X" must not silently become
   * "X-Ray". Revisit if a canonical modality vocabulary is ever confirmed
   * (CLAUDE.md §18).
   */
  languageSensitive: boolean;
  /**
   * Whether a photograph of the equipment or its nameplate can show this
   * value. Drives §3a: only these fields are worth a photo re-request.
   *
   * Brand, model and the manufacture/installation year are printed on
   * nameplates. Modality is usually inferable from the equipment's appearance.
   * How many units a room contains, which hospital it is, what city it is in,
   * how many years it has been in service and whether it currently works are
   * not properties of a nameplate — asking for another photo of those would
   * waste the user's time in the field.
   */
  visionReadable: boolean;
  /** Spanish label used when the agent asks for this field. */
  label: string;
}

export const CAPTURE_FIELD_SPECS: Record<CaptureField, CaptureFieldSpec> = {
  quantity: {
    field: 'quantity',
    kind: 'integer',
    languageSensitive: false,
    required: true,
    visionReadable: false,
    label: 'la cantidad de equipos',
  },
  siteName: {
    field: 'siteName',
    kind: 'text',
    languageSensitive: true,
    required: true,
    visionReadable: false,
    label: 'el nombre del sitio',
  },
  country: {
    field: 'country',
    kind: 'text',
    languageSensitive: true,
    // Required alongside siteName and city: a visit record must say where the
    // hospital is, not just its name (product requirement, 2026-09-10).
    required: true,
    visionReadable: false,
    label: 'el país',
  },
  city: {
    field: 'city',
    kind: 'text',
    languageSensitive: true,
    required: true,
    visionReadable: false,
    label: 'la ciudad',
  },
  brand: {
    field: 'brand',
    kind: 'text',
    languageSensitive: false,
    required: true,
    visionReadable: true,
    label: 'la marca',
  },
  model: {
    field: 'model',
    kind: 'text',
    languageSensitive: false,
    required: false,
    visionReadable: true,
    label: 'el modelo',
  },
  modality: {
    field: 'modality',
    kind: 'text',
    languageSensitive: true,
    required: true,
    visionReadable: true,
    label: 'la modalidad',
  },
  estimatedYearsOfUse: {
    field: 'estimatedYearsOfUse',
    kind: 'integer',
    languageSensitive: false,
    required: false,
    visionReadable: false,
    label: 'los años de uso estimados',
  },
  estimatedInstallationYear: {
    field: 'estimatedInstallationYear',
    kind: 'integer',
    languageSensitive: false,
    required: false,
    visionReadable: true,
    label: 'el año de instalación',
  },
  operationalStatus: {
    field: 'operationalStatus',
    kind: 'text',
    languageSensitive: true,
    required: false,
    visionReadable: false,
    label: 'el estado operativo',
  },
  notes: {
    field: 'notes',
    kind: 'text',
    languageSensitive: true,
    required: false,
    visionReadable: false,
    label: 'notas adicionales',
  },
};

export const REQUIRED_FIELDS: CaptureField[] = CAPTURE_FIELDS.filter(
  (field) => CAPTURE_FIELD_SPECS[field].required
);

export const VISION_READABLE_FIELDS: CaptureField[] = CAPTURE_FIELDS.filter(
  (field) => CAPTURE_FIELD_SPECS[field].visionReadable
);

export const LANGUAGE_SENSITIVE_FIELDS: CaptureField[] = CAPTURE_FIELDS.filter(
  (field) => CAPTURE_FIELD_SPECS[field].languageSensitive
);

export function isVisionReadable(field: CaptureField): boolean {
  return CAPTURE_FIELD_SPECS[field].visionReadable;
}

export function isLanguageSensitive(field: CaptureField): boolean {
  return CAPTURE_FIELD_SPECS[field].languageSensitive;
}

export function kindOf(field: CaptureField): 'text' | 'integer' {
  return CAPTURE_FIELD_SPECS[field].kind;
}

export function labelOf(field: CaptureField): string {
  return CAPTURE_FIELD_SPECS[field].label;
}
