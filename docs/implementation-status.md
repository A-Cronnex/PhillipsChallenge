# Estado de integración — 9 de septiembre de 2026

Se conectó el recorrido local desde una instalación vacía hasta observaciones
persistidas y enviables al servidor. Se generó y compiló el APK Android de
desarrollo. Esto no constituye validación de inferencia en hardware ni despliegue
de infraestructura.

## Auditoría e implementación

| Sección encontrada | Resultado |
|---|---|
| Node 18 incompatible con el plugin ESM | `.nvmrc` con Node 24; motores y guía alineados; comandos ejecutados con Node 24.13.0 |
| Faltaban proyectos nativos y cliente de desarrollo | `expo-dev-client` instalado; prebuild Android y compilación `assembleDebug` completados |
| Una base vacía no tenía usuario ni mecanismo de alta | Pantalla de primer uso con identidad local estable para atribuir capturas |
| No se creaban sitios | Alta offline con validación, coordenadas opcionales y cola atómica |
| No se creaban/vinculaban equipos | Elegir equipo existente o crearlo con la primera observación en la misma transacción |
| Duplicados sin tratamiento | Bloquear sitios con nombre/ciudad/país iguales y equipos con sitio/marca/modelo/modalidad iguales; solicitar selección del registro existente |
| `completion().text` tratado como string | Await de la promesa real del SDK; tipo del adaptador derivado del SDK instalado |
| VisionPsy sin proyector | `modelConfig.projectionModelSrc` junto con el modelo; rutas locales normalizadas |
| Voz sin UI y parámetro STT equivocado | Grabador con permisos, detención, reintento y `transcribe({ audioChunk })` |
| es↔en sin conectar | Bergamot antes de extracción y para la pregunta de seguimiento, preservando el original español |
| Modelos sin estrategia de primer uso clara | Descriptores descargan/cachéan al primer uso; instrucción explícita de preparar cada modalidad online |
| Conversaciones solo en memoria | Migration 003 y snapshots locales; checkpoint antes de inferir y recuperación de la última conversación |
| Conversación nunca producía observación | Pantalla de revisión/corrección/confianza y confirmación transaccional, idempotente por conversación |
| Fotos/audios apuntaban a caché temporal | Copia al directorio privado de documentos antes de conservar referencias |
| Campos textuales iniciales limitados a los legibles en una foto | La extracción textual inicial considera todos los campos desconocidos, incluidos cantidad y sitio |
| Rechazos de validación invisibles | Aviso en conversación y revisión manual; los valores no aceptados no se incorporan al registro |
| No había acción de sincronización | Botón en Tablero, estado de ejecución, resultado y reintento |
| URL y autenticación no conectadas | Variables públicas solo para URLs; token en memoria y validación de hash por usuario/dispositivo en servidor |
| Lotes podían situar hijos antes de padres | Orden de dependencias en la selección de la cola, antes del límite de ejecución |
| Fechas imposibles podían normalizarse en JavaScript | Rechazo de fechas como 30 de febrero antes de persistir |

## Verificaciones ejecutadas

- `npm test -- --runInBand`: **472 pruebas, 39 suites, todas pasan**.
- `npm run typecheck`: sin errores.
- `npm run build --prefix server`: compilación y chequeo de tipos correctos.
- `npm run verify:local`: SQLite real en Node 24, migraciones, primer uso,
  duplicados, historial de equipo, pertenencia a sitio, rollback, recuperación,
  guardado repetido de conversación, fuentes y orden de cola, sin violaciones FK.
- `npx expo prebuild --platform android --no-install`: correcto; QVAC generó y
  verificó su worker y addons.
- `npx expo export --platform android`: bundle Android/Hermes generado.
- `./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a`: **BUILD
  SUCCESSFUL**, con SDK/build-tools 36, NDK 29.0.14206865, JDK 17 y Gradle 8.14.3.
- APK generado: `android/app/build/outputs/apk/debug/app-debug.apk` (aprox. 489 MiB).
  Es una build de desarrollo; necesita Metro. No se compiló la variante release.
- `adb devices`: sin dispositivos conectados; no se instaló ni ejecutó en teléfono.

Las pruebas de servidor existentes cubren contrato y aplicación; en esta sesión
no se volvió a ejecutar el ensayo contra PostgreSQL real descrito anteriormente.
Las pruebas nuevas del autenticador verifican aceptación y rechazo de
credenciales y la vinculación a un dispositivo. SQLite de Node prueba el SQL y
las transacciones, no la implementación nativa de `expo-sqlite`.

## Decisiones y límites restantes

1. **Validación física pendiente.** Hay que medir descarga, memoria, latencia,
   calidad de extracción/traducción, lectura de placas, permisos, grabación y
   reintentos en el teléfono objetivo. No se puede concluir que la IA está lista
   para campo a partir de Jest o de una compilación exitosa.
2. **Infraestructura sin desplegar.** Se necesita PostgreSQL, alta administrativa
   del usuario, credenciales de dispositivo, HTTPS, dominio y hospedaje del
   backend. La app deja los registros pendientes mientras falta la URL. No se
   crearon cuentas externas ni recursos de nube.
3. **Push únicamente.** No se añadió pull, borrado ni Bluetooth. Descargar el
   catálogo central requiere definir autorización de lectura, cursor y
   tombstones. Bluetooth sigue fuera del MVP por las reglas del proyecto.
4. **Mapas base.** El cableado acepta un estilo propio configurable, pero no se
   creó un servidor de tiles ni un paquete geográfico. Las coordenadas se ingresan
   manualmente; no se añadió geocodificación ni permiso GPS.
5. **Identidad.** La identidad del primer uso es local. El protocolo del MVP es
   bearer por dispositivo, provisionado por administrador, con revocación y
   rotación por configuración del servidor. No implementa SSO, autorregistro,
   recuperación de cuenta ni almacenamiento seguro persistente del token.
6. **Protección y retención local.** SQLite, snapshots, fotos y audio viven en el
   sandbox de la app. `allowBackup=false` desactiva el backup Android de la app.
   No se agregó cifrado aplicativo ni purga automática: desinstalar/limpiar datos
   elimina el dataset local, y el protocolo actual no restaura medios ni datos
   desde el servidor. Debe acordarse la política de retención y cifrado para un
   despliegue real. Los archivos creados y luego abandonados se conservan.
7. **Duplicados.** La comparación es exacta después de trim y `lower` de SQLite
   (sin normalización Unicode completa). No se hace reconciliación difusa ni
   fusión automática. Equipos idénticos de un mismo sitio se tratan como un grupo;
   nuevas visitas son nuevas observaciones del mismo registro. La ficha original
   de equipo no se sobrescribe automáticamente con una observación posterior.
8. **Historial de conversaciones.** Se conserva todo en SQLite y se recupera la
   última conversación. No se añadió un explorador de todas las conversaciones
   antiguas. Los cambios aún no confirmados de la pantalla de revisión viven en
   memoria; los turnos originales ya enviados sí se guardan.

La instalación, las variantes APK y el checklist operativo están en
[android-installation.md](android-installation.md). El acceso al servidor está en
[sync-api.md §14](sync-api.md#14-conexion-operativa-del-mvp).
