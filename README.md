# Hospital Equipment Intelligence — Setup

Mobile app for offline-first capture, organization, and analysis of
medical equipment data. See `CLAUDE.md` for project rules and `docs/`
for architecture, domain model, and stack details.

## 1. Prerequisites

- Node.js (LTS) and npm.
- Watchman (macOS, recommended by Expo for file watching).
- Xcode (for iOS builds/simulator) — macOS only.
- Android Studio with an Android SDK + emulator (for Android builds).
- EAS CLI, for building a development client: `npm install -g eas-cli`.

You do **not** need the plain Expo Go app for day-to-day development on
this project — see the note in step 4.

## 2. Clone and Install

```bash
git clone <repo-url>
cd hospital-equipment-intelligence
npm install
```

## 2a. Current State of the Project

Scaffolded and running under Expo SDK 54. Implemented so far:

- `database/` — SQLite schema and migrations (`docs/database.md` §17).
- `features/observations/` — manual observation capture
  (`docs/manual-capture.md`).
- `features/maps/` + `services/maps/` — map of customer sites and their
  equipment, plus offline region downloads (`docs/maps.md`).
- `features/conversations/` + `services/ai/` — local AI capture agent with the
  vision-first flow (`docs/ai-agent-implementation.md`).
- `features/dashboard/` — local analytics over captured observations,
  computed on-device with no network dependency (`docs/dashboard.md`).
- `features/synchronization/` + `services/sync/` + `server/` — the upload
  half of synchronization: the device queue, the `POST /v1/sync` endpoint, and
  the client-wins conflict resolution (`docs/sync-api.md`). **Disabled by
  default** — no sync server is configured, so records stay `pending`, which is
  the correct state for a device with nowhere to sync to. The download
  direction is not implemented; `docs/sync-api.md` §2 explains what blocks it.

**MapLibre and QVAC are both installed, so section 4 applies: a development
build is required and Expo Go will not work.**

**Node ≥ 20.17 is required** (`nvm use 24`). QVAC's Expo config plugin is
ESM-only and `expo prebuild` fails on Node 18 — see
`docs/ai-agent-implementation.md` §2.

**QVAC does not run on emulators.** Everything on the *Agente* tab needs a
physical device; the checklist is in `docs/ai-agent-implementation.md` §10.

## 3. Environment Configuration

The backend is confirmed as **Node.js + PostgreSQL** and lives in `server/`
(`docs/tech-stack.md` §5). It is not deployed anywhere, so the app ships with
synchronization **disabled**.

### 3.1 Mobile app

`services/sync/config.ts` holds `syncServerConfig`, which ships as
`{ mode: 'disabled' }`. No URL and no credential is committed. When a
deployment exists, its address belongs in a `.env` file (not committed) read
through `app.config.ts`, and this section will be updated with the variable
names.

The app enforces `https://` for any non-loopback sync URL — hospital data must
not travel unencrypted.

### 3.2 Server

See `server/README.md`. It needs `DATABASE_URL` in the environment (no
default), and it **refuses every request until an authentication protocol is
configured** — that protocol is still an open decision (`CLAUDE.md` §18).

## 4. Important: This Project Needs a Development Build, Not Expo Go

`@maplibre/maplibre-react-native` (used for offline maps) requires custom
native code. The stock Expo Go app cannot load it.

### 4.1 One-time setup

1. Install the package and register its config plugin in `app.json`:

   ```bash
   npm install @maplibre/maplibre-react-native
   ```

   ```json
   {
     "expo": {
       "plugins": ["@maplibre/maplibre-react-native"]
     }
   }
   ```

   The plugin is what tells `expo prebuild` to wire MapLibre's native
   code into the generated iOS/Android projects — without it in
   `app.json`, prebuild produces a build that doesn't actually include
   MapLibre.

2. Generate the native projects:

   ```bash
   npx expo prebuild
   ```

3. Build and install the development client:

   ```bash
   npx expo run:android   # or: npx expo run:ios
   ```

   This installs a custom "dev client" — a build of the app that already
   includes MapLibre's native code — onto whatever emulator/simulator is
   currently open, or onto a physical device connected via USB with
   Developer Mode enabled if you target that instead.

### 4.2 Emulator vs. physical device

- **MapLibre (maps) works on both an emulator/simulator and a physical
  device.** Expect it may render a bit slower or show minor artifacts on
  an emulator, but it functions.
- **QVAC (local AI) only works on a physical device** — see the note
  below. An emulator is fine for everything except screens that actually
  run inference.

### 4.3 Day-to-day development

Once the dev client is installed (step 3 above), you don't repeat
`expo run` every time:

```bash
npx expo start --dev-client
```

Open the app from the dev client already installed on the
emulator/device — not from Expo Go. Re-run `expo prebuild` + `expo run`
only when a native dependency (MapLibre, QVAC, or another native module)
is added or updated.

### Local AI (QVAC)

The local AI runtime, `@qvac/sdk`, needs the same prebuild step plus its
own peer dependencies and config plugin — see `docs/tech-stack.md`
section 6 for the exact install commands and `app.json` plugin entry.

**QVAC does not run on the iOS Simulator or Android Emulator.** Any
screen or test that touches real on-device inference must be run on a
physical device with Developer Mode enabled. Map testing can still use
a simulator/emulator; AI testing cannot.

If MapLibre has not been added to a given branch/checkout yet, plain
`npx expo start` and Expo Go will work, but this stops being true as soon
as the maps feature lands, so the dev-client workflow above is the
supported path for this repo going forward.

## 5. Running the App

```bash
# Start Metro with the dev client
npx expo start --dev-client

# Or build and launch directly on a platform
npx expo run:ios
npx expo run:android
```

## 6. Local Database

`expo-sqlite` requires no manual native setup beyond `npx expo install
expo-sqlite` (already in `package.json` once added) — no `pod-install`
or extra linking step is needed for a managed Expo project. The database
file persists on-device across app restarts, so no seed step is required
to test offline persistence — the first run initializes and migrates the
schema per `docs/database.md`.

## 7. Common Scripts

| Command | Purpose |
|---|---|
| `npm install` | Install dependencies. |
| `npx expo install <package>` | Add a dependency, resolved for SDK compatibility (use this instead of plain `npm install` for Expo/RN native packages). |
| `npx expo start --dev-client` | Start Metro for the custom dev client. |
| `npx expo run:ios` / `run:android` | Build and run natively. |
| `npx expo prebuild` | Regenerate native `ios/`/`android/` folders after native-dependency changes. |
| `npm test` | Run the Jest suite (`jest-expo` preset) — covers the app and the server's pure layers. |
| `npm run typecheck` | Type-check with `tsc --noEmit`. |
| `npm install --prefix server` | Install the sync server's own dependencies (`pg`). Kept out of the app's dependency tree. |
| `npm run migrate --prefix server` | Apply the central Postgres schema (needs `DATABASE_URL`). |
| `npm start --prefix server` | Run the sync server (after `npm run build --prefix server`). |

## 8. Troubleshooting

- **Map renders slowly or with artifacts on the Android emulator**:
  expected on some AVDs — enable hardware/GPU acceleration in the AVD's
  graphics settings, or switch to a physical device if it's unusable.
- **App crashes or map is blank**: confirm you're running from the
  development client, not Expo Go.
- **Native module errors after adding a package**: run `npx expo
  prebuild` again to regenerate native projects, then rebuild.
- **iOS build fails after adding a native dependency**: delete
  `ios/Pods` and `ios/Podfile.lock`, then re-run `npx expo prebuild` and
  `npx expo run:ios`.

## 9. What's Still Undecided

Authentication and several other items remain open decisions — see
`docs/tech-stack.md` §9, `docs/sync-api.md` §13, and `CLAUDE.md` §18. The
backend technology itself is no longer among them (§3 above).

The one that blocks deployment: **no authentication protocol is chosen**, so
the sync server refuses every request by default.
