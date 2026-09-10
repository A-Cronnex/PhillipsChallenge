# AI Agent

## 1. Purpose

The AI agent assists users in capturing structured information about
medical equipment.

The agent must extract information from voice, text, and images.

The agent must not directly modify the database.

## 2. Supported Inputs

- Voice.
- Text.
- Images.

## 3. Core Workflow

```text
User Input
    ↓
Input Processing
    ↓
AI Inference
    ↓
Structured Extraction
    ↓
Validation
    ↓
Follow-up Questions
    ↓
User Confirmation
    ↓
Local Persistence
    ↓
Synchronization
```

## 3a. Vision-First Capture Flow (Confirmed)

When the user provides a photo, the agent follows this sequence before
falling back to other input modes:

```text
User provides a photo
        ↓
VisionPsy analyzes the image against the required fields (section 4)
        ↓
Does the image show data for the missing/required field(s)?
        ├── Yes → extract it, mark capture_source = "image",
        │         set attribute status per section 8
        │         (confirmed/reported/estimated based on legibility)
        │
        └── No  → ask the user to provide a photo that explicitly shows
                   that field (e.g. "¿puedes tomar una foto de la placa
                   del equipo donde se vea el modelo?")
                        ↓
                   Does the user provide a suitable photo?
                        ├── Yes → re-run VisionPsy analysis on the new photo
                        │
                        └── No / user indicates they don't have or don't
                            know how to get that photo
                                ↓
                            Agent suggests switching to voice for that
                            field ("¿prefieres decírmelo por voz?")
                                ↓
                            Continue the conversation via voice/text for
                            the remaining field(s)
```

Rules:

- Do not ask for a second photo indefinitely — one re-request per
  missing field is enough before offering the voice fallback.
- The switch to voice is a suggestion, not forced; the user can keep
  trying with photos if they prefer.
- Fields already confirmed from an earlier photo are not re-asked when
  the flow falls back to voice for the remaining ones — the fallback is
  per-field, not a restart of the whole capture.
- This flow applies per missing/required field, not once for the whole
  observation — a single conversation can extract some fields from a
  photo and others by voice in the same session.

## 4. Required Information

The agent should capture:

- Quantity of equipment.
- Site name.
- Country.
- City.
- Equipment brand.
- Equipment model.
- Modality.
- Estimated years of use.
- Estimated installation year.
- Operational status.
- Capture source.
- Additional notes.

## 5. Missing Information

If a required value is missing:

- Ask a specific follow-up question.
- Do not invent a value.
- Do not infer a value without marking it as estimated.
- If the user explicitly does not know the value, store `unknown`.

## 6. Ambiguous Information

If the information is ambiguous:

- Ask a clarification question.
- Do not silently select one interpretation.
- Preserve the original user statement when appropriate.

## 7. Structured Extraction

The AI should return structured data.

Example:

```json
{
  "site": {
    "name": "Hospital Example",
    "city": "Panama City",
    "country": "Panama"
  },
  "equipment": {
    "quantity": 5,
    "brand": "Philips",
    "model": null,
    "modality": "Monitor"
  },
  "observation": {
    "estimated_years_of_use": 8,
    "operational_status": "unknown",
    "capture_source": "voice"
  }
}
```

The exact schema must be validated by the application.

## 8. Validation

Validation must include:

- Required fields.
- Data types.
- Allowed enumerations.
- Geographic values.
- Numeric ranges.
- Confidence values.
- Status values.
- Source values.
- Duplicate detection.

## 9. Confidence

The agent must ask the user about confidence when required by the
business workflow.

Confidence should be stored per attribute.

Example:

```
brand_confidence = high
model_confidence = medium
modality_confidence = high
installation_year_confidence = low
```

The overall confidence must be calculated by an explicit rule.

## 10. Final Analysis

After the capture is complete, the agent may generate notes about the
conversation.

Notes must not replace structured fields.

Notes must not be treated as verified facts without validation.

## 11. Conversation State

The agent should maintain a state such as:

- `collecting`
- `awaiting_clarification`
- `awaiting_confirmation`
- `ready_to_save`
- `saved`
- `failed`

## 12. AI Runtime

The application uses `@qvac/sdk` (QVAC, by Tether) for local inference.
See `docs/tech-stack.md` section 6 for installation, the Expo config
plugin, and version requirements.

QVAC covers the three required input types through one SDK:

- Text and voice: LLM text completion, with a Whisper- or
  Parakeet-backed speech-to-text step ahead of it.
- Images: multimodal inference (text + images in the same context),
  so a photo of a nameplate or equipment label can be combined with the
  user's spoken/typed description in a single extraction call.

QVAC does not run on iOS Simulator or Android Emulator (a `llama.cpp`
limitation). All development and testing of actual inference behavior —
including the AI contract tests in `docs/testing.md` — must use a
physical device, or a mocked QVAC layer where a device isn't available.
This constraint should be treated as a hard requirement when planning
CI and QA, not an implementation detail to work around silently.

Still not decided (do not invent):

- Which specific GGUF model(s) back text extraction vs. speech-to-text
  (beyond MedPsy and VisionPsy already proposed in `docs/tech-stack.md`
  §6).
- Model distribution: bundled with the app build vs. downloaded on
  first run (QVAC supports peer-to-peer model fetch, but whether this
  project uses it is unresolved).
- Exact prompt/response contract with the model beyond the structured
  JSON shape shown in section 7 above.

Confirmed: language scope is **Spanish input (translated to English via
TranslatePsy-EuroNano) plus native English input**, not open-ended "any
language." See `docs/tech-stack.md` §7.2 for the translation pipeline.
TranslatePsy is a translation-only step around MedPsy, not a
replacement for it — MedPsy remains the component that performs
extraction and confidence scoring.

Confirmed (2026-09-10): **the model does not generate the follow-up
question.** The JSON schema in section 7 has no free-text
`followUpQuestion` field. Early field testing showed MedPsy producing
incoherent or hallucinated text there whenever the user's turn was not
a straightforward answer (e.g. the user asking the agent a domain
question back instead of supplying a value), and that text still had to
survive a further en→es machine-translation pass, which compounded the
incoherence. What the agent asks next is now composed entirely by the
application from domain state — which required fields
(`features/conversations/domain/fields.ts`) are still unknown — so it is
deterministic and testable without a model
(`features/conversations/application/conversation-orchestrator.ts`,
`messageFor` and `composeMessage`). This is the CLAUDE.md §7 principle
applied to the question itself, not only to the extracted values: the
agent proposes, the application decides what is actually said.

Confirmed: **`notes` and other free-text fields are persisted in the
user's preferred/original language**, not in the English text MedPsy
reasoned over internally. The English translation is a transient
working copy for MedPsy only and is not written to the database — see
`docs/tech-stack.md` §7.2 and `docs/domain-model.md` §6.

## 13. Model Failure

If inference fails:

- Preserve the original input.
- Inform the user.
- Allow retry.
- Do not create a fabricated record.
- Do not silently discard the conversation.

## 14. Security

- Do not log raw audio unnecessarily.
- Do not expose sensitive information in prompts or logs.
- Do not execute arbitrary model output.
- Do not trust model-generated SQL.
- Do not trust model-generated file paths.
