# Hospital Equipment Intelligence

Aplicación Expo/React Native para registrar equipos y observaciones hospitalarias
sin conexión, con captura manual y un agente local de texto, fotos y voz.
SQLite conserva los datos, MapLibre muestra los sitios y Node.js/PostgreSQL recibe
la cola de sincronización cuando hay un servidor configurado.

**Instalación en teléfono: [guía completa de Android](docs/android-installation.md).**
**Implementación y verificaciones: [estado del proyecto](docs/implementation-status.md).**

## Inicio rápido

Requiere Node 24, JDK 17, Android SDK 36, NDK 29.0.14206865 y un teléfono Android
ARM64 con Android 10 o superior. MapLibre y QVAC requieren una build nativa;
Expo Go no es compatible.

```bash
nvm install 24
nvm use
npm ci
npm run prebuild:android
npx expo run:android --device
```

Para continuar después de instalar el cliente de desarrollo:

```bash
adb reverse tcp:8081 tcp:8081
npm start -- --localhost
```

Una build de desarrollo necesita Metro. Para probar de forma autónoma consulta
la variante release en la guía de Android.

## Flujos conectados

- Primer inicio: crear un usuario local con su nombre.
- Captura: registrar sitios con coordenadas opcionales; elegir equipo existente
  o crear uno al guardar la primera observación; conservar su historial.
- Agente: texto, cámara y grabación; QVAC con MedPsy, VisionPsy + proyector,
  Whisper y traducción es↔en; revisión editable antes de guardar.
- Persistencia: guardar los turnos antes de inferir, recuperar la última
  conversación y confirmar observaciones de forma atómica e idempotente.
- Tablero/mapa: leer los datos locales. Descargar mapa base requiere un estilo
  y recursos de mapas alojados en infraestructura propia.
- Sincronización: enviar sitios, equipos, conversaciones y observaciones por
  orden de dependencia; autenticación por credenciales de dispositivo y botón
  de envío con resultado visible.

## Configuración

Sin `.env`, la app guarda localmente y deja la cola pendiente. Copia `.env.example`
si tienes un servidor y/o mapa base. Las únicas variables públicas son
`EXPO_PUBLIC_SYNC_URL` y `EXPO_PUBLIC_MAP_STYLE_URL`; no incluyas credenciales.
El token se introduce en el Tablero y se mantiene en memoria durante la sesión.

El servidor requiere `DATABASE_URL`, provisionar el usuario en PostgreSQL y
`SYNC_DEVICE_CREDENTIALS`. Consulta [server/README.md](server/README.md) y
[contrato de sincronización](docs/sync-api.md#14-conexion-operativa-del-mvp).
No hay un servidor desplegado por este repositorio. La descarga de cambios
centrales y las eliminaciones sincronizadas siguen fuera del protocolo actual.

## Verificación

```bash
npm test -- --runInBand
npm run typecheck
npm run verify:local
npm ci --prefix server
npm run typecheck --prefix server
npm run build --prefix server
```

`verify:local` usa SQLite real de Node 24 para probar los repositorios y sus
transacciones; no sustituye la prueba de `expo-sqlite` en Android. Los tests de
QVAC comprueban su contrato con dobles del SDK; la calidad de inferencia, memoria
y latencia requieren un teléfono físico. Los pesos se descargan al primer uso
de cada modelo: prepara todas las modalidades antes de trabajar sin Internet.

Las reglas de arquitectura y dominio están en `CLAUDE.md` y `docs/`.
