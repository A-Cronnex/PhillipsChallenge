# Architecture

## 1. Purpose

This document defines the high-level architecture of the mobile
application and its relationship with the central server.

The architecture must support offline-first operation, local AI inference,
local persistence, and eventual synchronization.

## 2. System Overview

The system contains two main ecosystems:

1. Mobile application.
2. Centralized server.

The mobile application is the primary environment for field work.

The central server provides centralized storage, synchronization,
administration, and access to the consolidated dataset.

## 3. High-Level Architecture

```text
                    Central Server
              ┌──────────────────────┐
              │ Authentication       │
              │ API                  │
              │ Central Database     │
              │ Synchronization      │
              │ Analytics            │
              └──────────┬───────────┘
                         │
                    Network
                         │
              ┌──────────▼───────────┐
              │ Mobile Application   │
              │                      │
              │ UI                   │
              │ Domain Logic         │
              │ Local Database       │
              │ AI Inference         │
              │ Offline Maps         │
              │ Synchronization      │
              └──────────────────────┘
```

## 4. Mobile Layers

### Presentation Layer

Responsible for:

- Navigation.
- Screens.
- Forms.
- Dashboards.
- Maps.
- Conversation interface.
- Validation feedback.
- Offline status indicators.

### Application Layer

Responsible for:

- Capture workflows.
- Observation creation.
- Conversation orchestration.
- Synchronization orchestration.
- Dashboard queries.
- Map data preparation.

### Domain Layer

Responsible for:

- Equipment.
- Sites.
- Observations.
- Confidence.
- Status.
- Business rules.
- Duplicate detection.
- Domain validation.

### Infrastructure Layer

Responsible for:

- Local database.
- AI runtime.
- Audio and image access.
- Map rendering.
- Offline map storage.
- Network requests.
- Synchronization transport.

## 5. Recommended Project Structure

```
app/
├── (auth)/
├── (tabs)/
│   ├── dashboard/
│   ├── capture/
│   ├── map/
│   └── conversations/

components/
├── ui/
├── forms/
├── maps/
├── dashboard/
└── conversations/

features/
├── authentication/
├── sites/
├── equipment/
├── observations/
├── conversations/
├── dashboard/
├── maps/
└── synchronization/

database/
├── schema/
├── migrations/
├── repositories/
└── adapters/

services/
├── ai/
├── maps/
├── sync/
└── bluetooth/

lib/
types/
tests/
docs/
```

## 6. Dependency Direction

The intended dependency direction is:

```
UI
 ↓
Application Services
 ↓
Domain Logic
 ↓
Repositories / Interfaces
 ↓
Infrastructure Implementations
```

The domain layer must not depend directly on React Native UI components.

## 7. AI Boundary

The AI runtime is an infrastructure service.

It receives input and returns structured output.

It must not directly modify domain entities or database records.

```
User Input
    ↓
AI Service
    ↓
Structured Extraction
    ↓
Validation
    ↓
Domain Service
    ↓
Local Repository
```

## 8. Offline Boundary

The application must be usable without network access.

Network-dependent functionality must be isolated from local functionality.

```
Local Operation
    ↓
Local Database
    ↓
Pending Synchronization
    ↓
Network Available
    ↓
Synchronization Service
    ↓
Central Server
```

## 9. Map Boundary

Map rendering and business data are separate concerns.

```
MapLibre
    ├── Offline map resources
    ├── Map style
    └── Geographic rendering

Local Database
    ├── Sites
    ├── Equipment coordinates
    └── Geographic attributes
```

## 10. Bluetooth Boundary

Bluetooth synchronization must be implemented as a separate service.

It must not be embedded directly into the dashboard.

The dashboard may display synchronization status, but it must not own the
Bluetooth protocol.

## 11. Architectural Decisions — Proposed Solutions

The items below were originally listed as unresolved. Each now has a
proposed solution — full detail and installation steps live in
`docs/tech-stack.md`. Items marked **Confirmed** are settled; items
marked **Proposed** need your sign-off before implementation starts.

| Decision | Status | Proposed solution | Rationale |
|---|---|---|---|
| Navigation solution | Confirmed | `expo-router` | First-party Expo package, file-based routing, maintained alongside Expo SDK releases — no separate library to evaluate. |
| Local database library | Confirmed | `expo-sqlite` | Official Expo SDK library, async/JSI-based, works in a managed Expo project without ejecting. |
| AI runtime integration | Confirmed | `@qvac/sdk`, with **MedPsy-1.7B** (text extraction) and **VisionPsy-Nano-460M-Flash** (image/nameplate reading) as the initial models, plus QVAC's built-in Whisper backend for speech-to-text | See `docs/tech-stack.md` §6 for install steps and the model-selection rationale. Requires a physical device for testing — no emulator support. |
| Backend API contract | Proposed | REST, versioned (e.g. `/v1/...`), with a dedicated `/sync` endpoint that accepts a batch of pending local records and returns per-record outcomes (`synchronized`, `conflict`, `rejected`) | Matches the `sync_records` table already defined in `docs/database.md` — each record's `server_version`/`local_version` pair maps naturally onto per-item sync responses instead of an all-or-nothing batch result. |
| Synchronization protocol | Confirmed (policy) / Proposed (transport) | **Client-wins** conflict policy — the device version always overwrites the server on conflict. Transport is still proposed as cursor-based incremental sync (client sends `last_synced_at`, server returns changes since). | See `docs/offline-sync.md` §8 for the full rationale and the device-vs-device caveat, and `docs/tech-stack.md` §8. |
| Map tile provider | Confirmed | **Self-hosted only** — vector tiles generated offline from OpenStreetMap data via Protomaps/OpenMapTiles (`.pmtiles`/`.mbtiles`), bundled with the app or served from the project's own backend. No third-party map SaaS (MapTiler, Stadia Maps, etc.) — the project explicitly disallows runtime cloud dependencies. | See `docs/tech-stack.md` §4a. |
| Bluetooth implementation | Still deferred | Not proposed yet — stays experimental per `CLAUDE.md` §12. When it's picked up, `react-native-ble-plx` is the most maintained cross-platform BLE library to evaluate first, but device authentication, data scope, and conflict handling need their own design pass before any library choice matters. | Bluetooth is explicitly out of MVP scope; a library choice this early would be premature. |

All "Proposed" rows require confirmation before Claude Code scaffolds
the corresponding code, per the workflow in `CLAUDE.md` §4.
