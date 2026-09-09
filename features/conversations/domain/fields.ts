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
    required: true,
    visionReadable: false,
    label: 'la cantidad de equipos',
  },
  siteName: {
    field: 'siteName',
    required: true,
    visionReadable: false,
    label: 'el nombre del sitio',
  },
  country: {
    field: 'country',
    required: false,
    visionReadable: false,
    label: 'el país',
  },
  city: {
    field: 'city',
    required: false,
    visionReadable: false,
    label: 'la ciudad',
  },
  brand: {
    field: 'brand',
    required: true,
    visionReadable: true,
    label: 'la marca',
  },
  model: {
    field: 'model',
    required: false,
    visionReadable: true,
    label: 'el modelo',
  },
  modality: {
    field: 'modality',
    required: true,
    visionReadable: true,
    label: 'la modalidad',
  },
  estimatedYearsOfUse: {
    field: 'estimatedYearsOfUse',
    required: false,
    visionReadable: false,
    label: 'los años de uso estimados',
  },
  estimatedInstallationYear: {
    field: 'estimatedInstallationYear',
    required: false,
    visionReadable: true,
    label: 'el año de instalación',
  },
  operationalStatus: {
    field: 'operationalStatus',
    required: false,
    visionReadable: false,
    label: 'el estado operativo',
  },
  notes: {
    field: 'notes',
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

export function isVisionReadable(field: CaptureField): boolean {
  return CAPTURE_FIELD_SPECS[field].visionReadable;
}

export function labelOf(field: CaptureField): string {
  return CAPTURE_FIELD_SPECS[field].label;
}
