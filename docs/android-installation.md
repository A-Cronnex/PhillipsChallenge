# Instalación en un dispositivo Android

Esta guía corresponde al código integrado el 9 de septiembre de 2026. La app
funciona con datos locales desde la primera apertura; servidor y mapa base son
opcionales. La IA necesita descargar sus modelos antes de funcionar sin red.

## 1. Preparar la computadora

Usa **Node 24**. El repositorio incluye `.nvmrc` y exige Node ≥24. Node 18 no
puede cargar el plugin ESM de QVAC. Si usas nvm:

```bash
nvm install 24
nvm use
node --version
npm ci
```

Instala Android Studio y, desde SDK Manager:

- Android SDK Platform 36.
- Android SDK Build-Tools 36.0.0.
- Android SDK Platform-Tools (ADB) y Command-line Tools.
- NDK (Side by side) **29.0.14206865**, requerido por el plugin de QVAC 0.19.
- CMake si Gradle lo solicita.

Usa JDK 17 para esta compilación. En Linux, las rutas habituales son:

```bash
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
java -version
adb version
```

Ajusta las rutas a tu instalación; en macOS el SDK suele estar en
`$HOME/Library/Android/sdk`. Acepta las licencias en SDK Manager o  con
`sdkmanager --licenses`. La primera compilación descarga Gradle y dependencias
nativas; necesita conexión y bastante espacio en disco.

## 2. Preparar el teléfono

Usa un **dispositivo físico ARM64 con Android 10/API 29 o superior**.
El plugin fija `arm64-v8a`. Los modelos locales de esta aplicación no están
validados en emuladores. RAM suficiente para Android no garantiza RAM suficiente
para los modelos: la memoria y latencia deben medirse en el teléfono objetivo.

1. En el **Pixel 10a**, abre **Ajustes → Información del teléfono → Número de compilación**. Tócalo siete veces y confirma el PIN si se solicita.
2. Abre **Ajustes → Sistema → Opciones para desarrolladores → Depuración USB** y actívala.
3. Conecta un cable USB con transferencia de datos y acepta la huella RSA.
4. Ejecuta `adb devices -l`. Debe aparecer con estado `device`.

`unauthorized` significa que falta aceptar el permiso en el teléfono. Si no
aparece, revisa el cable, el modo USB y los permisos/udev de Linux o el controlador
USB del fabricante en Windows.

## 3. Configuración opcional

Para capturar localmente no necesitas `.env`. Para habilitar infraestructura:

```bash
cp .env.example .env
```

Configura solo lo que tengas disponible:

```dotenv
EXPO_PUBLIC_SYNC_URL=https://tu-servidor-de-sincronizacion
EXPO_PUBLIC_MAP_STYLE_URL=https://tu-servidor-de-mapas/style.json
```

La segunda URL debe servir un estilo MapLibre y sus tiles, sprites y fuentes desde
infraestructura propia. No es una URL de imagen ni una clave de Mapbox/MapTiler.
Sin ella, se muestran los puntos de los sitios sobre un fondo simple.

Este repositorio incluye esa infraestructura propia para Sao Paulo y Ciudad de
Panamá (`tileserver/`, ver [maps.md](maps.md) §4). Para levantarla en desarrollo:

```bash
cd tileserver
npm install
npm run fetch-sources   # descarga el extracto de OSM a data/*.geojson (una vez)
npm run build && npm start
```

Con el servidor escuchando (por defecto puerto 8090, en todas las interfaces),
apunta `EXPO_PUBLIC_MAP_STYLE_URL` a la IP de tu red local, la misma que usas
para Metro:

```dotenv
EXPO_PUBLIC_MAP_STYLE_URL=http://192.168.x.x:8090/styles/self-hosted.json
```

Reinicia Metro después. El teléfono debe estar en la misma red Wi-Fi.

Las variables `EXPO_PUBLIC_*` se incluyen en el JavaScript: **nunca pongas un
token en ellas**. La credencial de sincronización se introduce en el Tablero y se
mantiene solo en memoria. Para provisionarla, consulta [sync-api.md](sync-api.md#14-conexion-operativa-del-mvp).
Después de cambiar `.env`, reinicia Metro; para una APK autónoma vuelve a compilar.

## 4. Generar, compilar e instalar

Desde la raíz del repositorio:

```bash
nvm use
npm run prebuild:android
npx expo run:android --device
```

Selecciona el teléfono cuando Expo lo solicite. `prebuild` genera `android/`,
configura MapLibre, SQLite, cámara, micrófono y QVAC, y genera/verifica el worker
nativo de QVAC. `android/` y `qvac/` son archivos generados e ignorados por Git;
en otra computadora hay que repetir este paso después de `npm ci`.

El proyecto ya incluye `expo-dev-client`. **Expo Go no sirve** para esta app.
No instales paquetes nativos de nuevo siguiendo instrucciones antiguas: están
declarados en `package.json` y fijados por `package-lock.json`.

La compilación de desarrollo depende de Metro para cargar el JavaScript. Para
seguir trabajando después de instalarla:

```bash
adb reverse tcp:8081 tcp:8081
npm start -- --localhost
```

Abre Hospital Equipment Intelligence en el teléfono. Mantén Metro funcionando.
Para probar el comportamiento sin Internet durante desarrollo, USB +
`adb reverse` permite mantener Metro accesible sin Wi-Fi/datos móviles.
Eso comprueba las funciones locales, pero no equivale a una APK autónoma.

## 5. APK autónoma para probar sin Metro

Para probar la app sin computadora ni Metro:

```bash
nvm use
npx expo run:android --device --variant release
```

Esto integra el JavaScript en la APK e instala la variante release. También se
puede compilar sin teléfono y después instalar el archivo:

```bash
cd android
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
adb install -r app/build/outputs/apk/release/app-release.apk
```

El proyecto generado por Expo usa una clave de depuración también en release
hasta que configures firma propia. Esta variante sirve para pruebas internas;
no es una entrega firmada para Google Play. Para distribución configura una
clave de firma de la organización o un perfil EAS propio y conserva esa clave
fuera del repositorio. No desinstales la app para resolver un conflicto de firma
si contiene datos pendientes: desinstalar borra su almacenamiento local.

## 6. Primer uso y recorrido de comprobación

1. Escribe tu nombre en el primer inicio. Se crea una identidad local; no es
   una sesión autenticada contra el servidor.
2. **Captura** abre directamente el chat. Pulsa **Preparar agente** con Internet
   disponible. MedPsy se prepara primero; Bergamot, VisionPsy + proyector,
   Whisper y Silero VAD se descargan al utilizar cada modalidad.
3. Envía texto en español. El orb cambia con la operación y la respuesta aparece
   carácter por carácter. Con movimiento reducido, aparece completa.
4. Pulsa el micrófono. Espera **Te estoy escuchando** y comprueba el texto tenue
   provisional. Pulsa **Terminar grabación y enviar**: el texto definitivo llega
   al composer y se envía automáticamente. No hay un segundo botón de transcribir.
5. **Capturar placa con cámara** permite tomar o seleccionar una fotografía.
   Espera la comprobación de placa. Edita los datos/confianza y pulsa
   **Aceptar cambios y enviar**; sin esta confirmación no se aplican al chat.
6. Pulsa **Revisar y guardar observación**. Selecciona o registra el sitio (nombre
   obligatorio, coordenadas opcionales), selecciona equipo existente o nuevo,
   revisa fecha, valores y confianza y confirma el guardado local. Las correcciones
   son reportadas por texto; los valores intactos conservan su origen.
7. El icono de formulario del encabezado permite captura manual. Los sitios,
   equipos y observaciones también se crean offline por esta vía.
8. En **Tablero**, actualiza los datos; en **Mapa**, comprueba los sitios con
   coordenadas. La observación recién guardada queda pendiente de sincronización.
9. Reinicia la app para verificar recuperación. Una foto interrumpida se conserva
   como pendiente de revisión; nunca se confirma al reiniciar.
10. Antes de salir a campo, prueba todas las modalidades con red. Después, con
    una APK autónoma y modelos/mapas ya descargados, repite en modo avión.
    El dev client requiere Metro y no demuestra autonomía offline por sí solo.
11. Si tienes servidor, provisiona usuario/dispositivo y su credencial; introdúcela
    en el Tablero y utiliza el icono de sincronización. Repite para verificar
    idempotencia. No se transmiten fotos, audio ni snapshots mediante este protocolo.

Consulta [el flujo de captura](agent-capture-ui.md) para estados, validación,
procedencia, accesibilidad y límites del streaming.

## 7. Errores habituales

- **`ERR_REQUIRE_ESM` al hacer prebuild:** ejecuta `nvm use` en esa terminal.
- **QVAC requiere NDK 29:** instala exactamente `29.0.14206865`; no lo rebajes al
  NDK predeterminado de React Native, porque sus addons fueron compilados con 29.
- **No se encuentra SDK/JDK:** revisa `ANDROID_HOME` y `JAVA_HOME`.
- **Módulo nativo ausente:** repite prebuild y recompila. Reiniciar Metro no añade
  código nativo a una APK existente.
- **QVAC no carga:** confirma ARM64, primera descarga con red, almacenamiento y
  RAM. La UI conserva la captura para reintentar/revisar; usa Captura manual si
  la inferencia no está disponible. El SDK se carga de forma diferida.
- **Permiso de cámara/micrófono denegado:** habilítalo en Ajustes → Aplicaciones.
- **`NoClassDefFoundError: Lexpo/modules/kotlin/types/AnyTypeCache`:** una
  dependencia de Expo quedó en una versión de otro SDK. `expo-audio` declara
  `expo-asset` como par con rango `*`, y npm puede instalar la última versión
  publicada (57.x), compilada contra un `expo-modules-core` más nuevo que el de
  SDK 54. `package.json` fija `expo-asset` en `overrides`. Si reaparece, ejecuta
  `npx expo-modules-autolinking resolve -p android -j` y comprueba que
  `expo-asset` resuelva a 12.0.x; después reinstala y vuelve a compilar.
- **`TurboModuleRegistry.getEnforcing(...): 'PlatformConstants' could not be
  found` / `[runtime not ready]`:** el mensaje es engañoso; RN no perdió su
  módulo nativo. Antes, en `logcat`, aparece
  `SoLoader: couldn't find DSO to load: libnativehelper.so` seguido de
  `Failed to recover`. `libbare-kit.so` (prebuild de `react-native-bare-kit`,
  dependencia de QVAC) enlaza contra `libnativehelper.so`, que desde Android 13
  vive en el APEX de ART y ya no en `/system/lib64`. Con
  `extractNativeLibs="false"` SoLoader carga las librerías directamente desde el
  APK y resuelve él mismo las dependencias `NEEDED`: no encuentra
  `libnativehelper.so`, aborta la carga de `libappmodules.so` —la librería de
  codegen que registra todos los TurboModules, `PlatformConstants` incluido— y
  el arranque de JS falla. La solución es `useLegacyPackaging: true` en
  `expo-build-properties` (`app.json`), que extrae las librerías al directorio
  de la app y deja la resolución al enlazador del sistema, para el que
  `libnativehelper.so` sí es pública. Coste: la instalación ocupa más espacio.
  Requiere prebuild y recompilar; reinstalar la APK anterior no basta.
- **La cámara o el selector no responde:** había un bloqueo en las promesas de
  `expo-image-picker` en una build anterior del Pixel. La nueva integración pide
  el permiso Android con `PermissionsAndroid` y ofrece cancelación, límites de
  espera y selección de archivo como alternativa. Esto no certifica que la
  cámara/VisionPsy funcionen juntos: sigue siendo necesaria una foto real de placa.
- **`NoSuchMethodError` en `FontLoaderModule` / `getDirectConverter`:** se detectó
  físicamente `expo-font@57.0.3` como dependencia de `@expo/vector-icons` dentro
  de Expo 54. `package.json` ahora declara `expo-font~14.0.12`. Comprueba
  `npm ls expo-font`, instala con `npm ci` y recompila; reiniciar Metro no corrige
  una APK que contiene la clase nativa incompatible.
- **Voz en vivo no disponible tras actualizar JS:** `react-native-audio-api` es
  código nativo. Ejecuta `npm ci`, `npm run prebuild:android` y
  `npx expo run:android --device`; una recarga JS no basta. Whisper necesita
  además Silero VAD descargado, no solo el modelo de transcripción.
- **Sincronización devuelve 401:** revisa token, UUID de dispositivo y
  `SYNC_DEVICE_CREDENTIALS`; vuelve a introducir el token tras reiniciar la app.
- **Sincronización rechaza referencias:** el usuario debe existir también en
  Postgres. Los sitios/equipos/conversaciones se envían antes de sus observaciones.
- **HTTP desde el teléfono:** solo se permite HTTP loopback. Para pruebas locales
  usa `adb reverse tcp:8080 tcp:8080`, URL `http://127.0.0.1:8080` y una build de
  desarrollo. Para servidores remotos usa HTTPS con certificado confiable.

### Ver los errores en la computadora

La pantalla del teléfono muestra solo el mensaje; la traza completa está en
`logcat`. Con el teléfono conectado por USB:

```bash
adb logcat -c                    # limpia el búfer
adb logcat > ~/crash.txt         # abre la app, reproduce el fallo, Ctrl+C
```

Para verlo en vivo mientras arranca la app, filtrando el ruido del sistema:

```bash
adb logcat -c && adb logcat AndroidRuntime:E ReactNative:V ReactNativeJS:V ExpoModulesCore:V *:S
```

Un fallo nativo aparece bajo `AndroidRuntime`/`FATAL EXCEPTION` con la clase y
la pila completas. Los errores de JavaScript aparecen bajo `ReactNativeJS`.

## 8. Alcance de la verificación

Actualización del 10 de septiembre de 2026: se ejecutaron pruebas automatizadas,
SQLite real, TypeScript, prebuild y `assembleDebug` ARM64. Se instaló la build en
un **Pixel 10a** conectado/autorizado y se verificó el arranque con fuentes
corregidas, el tema oscuro, el chat recuperado, los controles superiores y el
composer por encima del teclado. La suite actual pasa 571 pruebas en 55 suites.

Las pruebas con mocks cubren voz parcial/final, presentación carácter por
carácter, detección/revisión de placa, confirmación y errores. No sustituyen
la prueba conjunta de micrófono/Whisper/Silero, cámara/VisionPsy con placas
reales, memoria, latencia ni una APK autónoma en modo avión. Esas comprobaciones
siguen pendientes y no deben darse por aprobadas por compilar la app.

Referencias: [QVAC para Expo](https://docs.qvac.tether.io/tutorials/expo/),
[requisitos QVAC](https://docs.qvac.tether.io/js-ts-sdk/),
[grabación con Expo SDK 54](https://docs.expo.dev/versions/v54.0.0/sdk/audio/).
Para nombres de campos del adaptador se usaron también los tipos y ejemplos
incluidos en `@qvac/sdk@0.19.0`, que son los que compila este repositorio.
