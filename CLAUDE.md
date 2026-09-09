# Hospital Equipment Intelligence — Project Instructions

## 1. Project Overview

This repository contains a mobile application for capturing, organizing,
analyzing, and synchronizing information about medical equipment installed
in hospitals and other customer sites.

The application is designed primarily for offline-first field work.

Users can interact with an AI agent through voice, text, and images.
The agent extracts structured information about medical equipment and
proposes records for a local dataset.

The application must support:

- Offline data capture.
- Local AI inference.
- Local persistence.
- Offline maps.
- Geographical visualization of sites and equipment.
- Local dashboards and analytics.
- Synchronization with a central server.
- Historical observations.
- Data validation and confidence tracking.

## 2. Primary Engineering Principle

Offline functionality is a first-class requirement.

Do not implement the application as an online application with an
offline fallback.

The local application must remain useful when the network is unavailable.

## 3. Source of Truth

The local database is the source of truth for the current device while
the application is offline.

The central server is the source of truth for the synchronized dataset.

Synchronization must not silently overwrite local changes.

## 4. Required Development Workflow

Before implementing a feature:

1. Read the relevant existing files.
2. Inspect the current architecture and data model.
3. Identify dependencies and integration points.
4. Explain the proposed implementation.
5. Identify assumptions and unresolved decisions.
6. Implement the smallest reasonable change.
7. Run the relevant tests.
8. Report the changes, tests, and remaining limitations.

Do not implement unrelated features.

Do not rewrite unrelated code.

Do not introduce a new architectural pattern without explaining why.

## 5. Architecture Rules

- Separate UI, domain logic, persistence, synchronization, and AI inference.
- Do not place database queries directly inside presentation components.
- Do not place AI inference logic directly inside UI components.
- Do not allow the AI model to write directly to the database.
- Validate all AI-generated structured data before persistence.
- Keep domain entities independent of UI-specific types.
- Keep synchronization logic independent of screen components.
- Prefer explicit interfaces over implicit coupling.

## 6. Offline Rules

- Do not assume network connectivity.
- Do not block the main capture flow on a network request.
- Persist user-created data locally before attempting synchronization.
- Clearly distinguish local, synchronized, pending, and failed states.
- Do not silently discard unsynchronized data.
- Do not require a server response to display locally available data.
- Do not use mock network responses as a substitute for offline behavior.

## 7. AI Rules

The AI agent extracts and proposes information.

The application is responsible for:

- Schema validation.
- Business-rule validation.
- Required-field validation.
- Confidence validation.
- Duplicate detection.
- Persistence.
- Synchronization.

Never trust model output without validation.

Never allow arbitrary model output to become a database query.

Never allow arbitrary model output to execute code.

## 8. Data Model Rules

The domain model must distinguish:

- Site.
- Equipment.
- Observation.
- User.
- Conversation.
- Source.
- Attribute confidence.
- Observation confidence.
- Synchronization state.

Do not collapse Equipment and Observation into one entity without
documenting the reason.

Do not invent fields that are not defined in the domain model.

## 9. Database Rules

- Use migrations for schema changes.
- Do not modify production data directly.
- Do not delete historical observations to simplify the model.
- Use stable identifiers.
- Preserve audit information.
- Define foreign-key relationships explicitly.
- Define indexes based on actual query requirements.
- Do not store secrets in the database without an approved security design.

## 10. Maps Rules

MapLibre is used for map rendering.

GeoJSON is used for geographic data representation.

GeoJSON is not the primary database for business data.

The application must distinguish:

- Map tiles and styles.
- Offline map regions.
- Site coordinates.
- Equipment coordinates.
- Business attributes.
- Local map cache state.

Do not assume that downloading a map automatically downloads business data.

## 11. Synchronization Rules

- Synchronization must be resumable.
- Synchronization must be idempotent.
- Synchronization must not create duplicate records.
- Synchronization must preserve historical observations.
- Synchronization conflicts must be explicit.
- Failed synchronization must be retryable.
- Do not silently resolve conflicts by overwriting data.

## 12. Bluetooth Rules

Bluetooth synchronization is experimental.

Do not implement it as part of the initial MVP unless explicitly requested.

Before implementing it, define:

- Device authentication.
- Data scope.
- Conflict resolution.
- Transfer protocol.
- Encryption requirements.
- Failure handling.
- Compatibility requirements.
- User consent.

Do not exchange the complete database by default.

## 13. UI Rules

The application has four primary sections:

- Dashboard.
- Capture.
- Map.
- Conversations.

The UI must support:

- Loading states.
- Empty states.
- Error states.
- Offline states.
- Pending synchronization states.
- Validation feedback.
- Accessible controls.
- Clear confirmation of saved data.

Use Material Design principles.

Use the project's approved animation library.

Do not add animations that interfere with data capture or accessibility.

## 14. Testing Rules

Before considering a feature complete:

- Run relevant unit tests.
- Run relevant integration tests.
- Test offline behavior when applicable.
- Test database persistence.
- Test synchronization behavior when applicable.
- Test validation failures.
- Test empty and error states.
- Report tests that could not be executed.

## 15. Security and Privacy

The application handles potentially sensitive hospital and equipment data.

- Do not log patient information.
- Do not log credentials or tokens.
- Do not expose sensitive data in debug output.
- Do not commit secrets.
- Do not include real production data in tests.
- Do not assume that local persistence is automatically secure.
- Document the protection of sensitive local data.
- Apply least-privilege access to server APIs.

## 16. Project Structure

The following structure is the intended organization.
Adapt it to the existing repository rather than restructuring the entire
project unnecessarily.

- `app/` — Application routes and screens.
- `components/` — Reusable UI components.
- `features/` — Domain-oriented application modules.
- `database/` — Local database schema, migrations, and repositories.
- `services/` — AI, maps, synchronization, and external integrations.
- `lib/` — Shared utilities and configuration.
- `types/` — Shared TypeScript types and contracts.
- `tests/` — Unit and integration tests.
- `docs/` — Technical documentation.

## 17. Definition of Done

A feature is complete only when:

- Its requirements are clearly defined.
- Its implementation follows the existing architecture.
- Its data model is consistent.
- Its validation rules are implemented.
- Its offline behavior is correct when required.
- Its error states are handled.
- Its relevant tests pass.
- It does not silently lose user data.
- It does not introduce unrelated changes.
- Its limitations are documented.

## 18. Important Unresolved Decisions

Do not invent final decisions for:

- Exact QVAC APIs and model versions.
- Exact local database library.
- Exact backend technology.
- Authentication protocol.
- Bluetooth protocol.
- Production deployment configuration.
- Data retention policy.
- Encryption implementation.

When one of these decisions is required, explain the options and
request confirmation or document the selected decision.

The following were previously on this list and are now confirmed —
see the linked section rather than treating them as open:

- Synchronization conflict policy → client-wins, `docs/offline-sync.md`
  §8 and `docs/tech-stack.md` §8.
- Map tile provider → self-hosted only, no third-party cloud,
  `docs/tech-stack.md` §4a.
