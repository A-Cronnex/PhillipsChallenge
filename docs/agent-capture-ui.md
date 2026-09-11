# Interfaz de captura del agente

La pestaña **Captura** abre directamente el chat. La preparación de QVAC es
explícita y diferida: mostrar la pantalla no importa el motor nativo ni descarga
pesos. **Preparar agente** habilita el modelo de texto; las demás modalidades
cargan sus modelos al primer uso. La captura manual permanece accesible.

## Arquitectura y componentes

Se conservan Expo Router, SQLite, los puertos de aplicación y la escala Material
de espaciado/tipografía. `lib/theme.ts` define la paleta oscura compartida por
navegación, tablero, mapa, formularios, errores y revisión. El estilo del servidor
de mapas también usa colores oscuros; los paquetes de mapas ya descargados pueden
conservar un estilo anterior hasta actualizarse.

- `ConversationScreen`: presentación, historial, composer y revisión.
- `useConversation`: orquestación, checkpoints y estado del motor.
- `useVoiceCapture` / `useNameplateCapture`: ciclos de captura y cancelaciones.
- `AIVoiceOrb`: transformaciones/opacidad con `Animated` nativo; sin dependencias
  de animación nuevas. Respeta movimiento reducido y la pestaña activa.
- `useResponseDelivery`: presentación progresiva de respuestas validadas.
- `NameplateReview`: campos editables y confianza, sin persistencia.
- `useConversationReview`: carga de catálogos y guardado mediante el servicio
  existente `saveConversation`; la vista final no accede a repositorios.
- `services/capture`: cámara, archivos y micrófono nativos.
- `services/ai/qvac-runtime`: única implementación del puerto de inferencia;
  los imports nativos QVAC siguen diferidos en `lib/ai-runtime.ts`.

Los estados de negocio de `ConversationState` no se sustituyen por estados de
animación. No cambian las tablas de observaciones ni las reglas de sincronización.

## Voz y estado del agente

| Estado del orb | Evento real | Presentación |
|---|---|---|
| `idle` | Sin operación activa | Respiración lenta, texto de disponibilidad |
| `listening` | Micrófono grabando | Ondas/pulsaciones, transcripción provisional tenue y de peso regular |
| `thinking` | Preparación, STT final o extracción | Rotación y pulsación lentas, explicación textual |
| `responding` | Evento de contenido de QVAC o entrega del mensaje validado | Pulsación y respuesta progresiva |

La nueva dependencia `react-native-audio-api@0.12.2` proporciona audio PCM y un
archivo WAV simultáneamente. `expo-audio` no ofrece buffers de grabación en vivo;
se conserva su integración de archivo existente, pero el chat principal utiliza
el nuevo adaptador. No se usa reconocimiento del sistema operativo ni un servicio
cloud. No se necesita `react-native-worklets` para este uso del grabador.

El adaptador envía mono PCM de 16 kHz, signed 16-bit little-endian, a
`transcribeStream({ metadata: true })`. Whisper se carga con
`VAD_SILERO_5_1_2`, imprescindible para su streaming, y español sin traducción.
QVAC emite segmentos cuando VAD detecta pausas: **la transcripción parcial es
progresiva por segmentos, no se promete una actualización por cada fonema**.
Las revisiones de segmentos sustituyen el fragmento anterior según `append`.

La preparación distingue **Preparando voz** (modelo/sesión, límite de 120 s)
y **Activando el micrófono** (permiso/arranque, límite de 20 s). Solo después
del arranque nativo aparece **Grabando**, con el botón cuadrado para terminar.
Durante la preparación, la acción dice **Cancelar preparación de voz**.
Si una operación vence o se cancela, sus recursos tardíos se liberan sin enviar
mensajes. El adaptador consulta primero el permiso: no vuelve a solicitarlo si
ya está concedido. En el Pixel 10a la solicitud redundante quedaba pendiente y
evitaba arrancar la captura (corregido el 2026-09-10). Se comprobó en el equipo
el inicio sostenido, crecimiento del WAV y liberación del micrófono al cancelar;
esto no certifica la calidad de transcripción de Whisper.

Al pulsar **Terminar grabación y enviar**, se conserva el WAV en almacenamiento
privado y se guarda su referencia antes de esperar la transcripción final. El
texto final llega al composer y se envía automáticamente con origen `voice`;
no se ejecuta STT por segunda vez. El checkpoint provisional se sustituye por
el texto definitivo. Texto vacío, permisos denegados y fallos no inventan datos.
Al cancelar o desmontar la vista se liberan micrófono y sesión. Una interrupción
al abandonar la app detiene la grabación y muestra un mensaje.

### Respuestas carácter por carácter

La salida visible se revela carácter por carácter usando `requestAnimationFrame`,
con una cadencia mínima de 22 ms. No se divide un par sustituto Unicode. El
estado `responding` termina cuando se entrega el último carácter. Al cambiar de
pestaña, pasar a segundo plano o activar movimiento reducido se muestra el texto
completo y se libera la operación.

Es una **presentación progresiva del mensaje validado**, no una simulación de
transcripción ni una exposición del JSON parcial del modelo. La extracción y la
traducción es↔en terminan primero; el mensaje completo se persiste antes de
revelarlo. Esto permite recuperar la respuesta íntegra si se cierra la app.
TalkBack recibe el mensaje completo, sin anuncios carácter por carácter.

## Fotografía y revisión

El botón rectangular bajo el orb ofrece **Tomar fotografía** y **Elegir de mis
fotos**. El flujo usa una unión discriminada:

`idle → capturing → processing → reviewing → submitting → idle`, con `error`
y cancelación explícitos. Una respuesta tardía de una operación cancelada no
modifica la vista ni confirma campos.

1. Validar imagen y copiarla a documentos privados. Guardar `pendingImagePath`
   en el snapshot local permite recuperar una foto interrumpida antes de inferir;
   todavía no se aplican campos ni se crea una observación.
2. VisionPsy devuelve `nameplate: detected | not_detected | uncertain`, además
   del contrato de extracción existente. `not_detected` y `uncertain` (o
   ausencia de metadatos) siguen bloqueando la revisión. **`detected` habilita
   la revisión aunque no se haya leído ningún atributo** (actualizado
   2026-09-10): VisionPsy-Nano-460M falla a menudo la lectura de una placa que
   sí ve, y llevar al usuario a un error sin salida con una foto buena en la
   mano es peor que abrir la revisión con las filas vacías para que las
   escriba. `NameplateProposal` lleva `nameplate` y `unreadable`
   (los campos objetivo que volvieron nulos).
3. Validar estructura, valores, rangos, campos solicitados y duplicados. Se
   mantienen los campos del catálogo marcados `visionReadable`: marca, modelo,
   modalidad y año de instalación explícito. Fabricación no equivale a instalación.
   No se introduce número de serie ni confianza numérica: no existen en el dominio.
4. Mostrar foto, un resumen de qué se leyó y qué no (`No se pudo leer: …`),
   los campos editables y su confianza. Los campos `unreadable` aparecen como
   filas vacías editables (origen "sin leer — escríbelo tú"); si se rellenan,
   su valor es `reported` / `text`. Aún así no se puede enviar una revisión
   totalmente vacía.

**Visibilidad del modelo (dev):** bajo `__DEV__`, `services/ai/qvac-runtime.ts`
registra en consola el texto crudo de cada modelo y su salida parseada, y
`nameplate-review.ts` registra un resumen (campos leídos, `unreadable`,
descartados). Nunca en release (`__DEV__` es falso): la salida cruda puede
repetir palabras del usuario sobre un sitio (docs/ai-agent.md §14).
5. **Aceptar cambios y enviar** valida las correcciones e incorpora un turno
   con la foto y un resumen al chat. Los valores intactos conservan estado,
   confianza y origen `image`; las correcciones son `reported` / `text`.
   No se hace una segunda inferencia para reinterpretar la aprobación.
6. El orquestador decide la siguiente pregunta con sus reglas existentes.
   **Revisar y guardar observación** conserva el flujo final de sitio/equipo,
   validación y escritura atómica/idempotente.

Una placa no detectada, borrosa o con salida inválida permite otra foto o volver
al chat. Un fallo de guardado conserva los campos editados para reintentar.
Los límites de espera del selector son recuperación de errores, no temporizadores
para aparentar estados del agente. El permiso Android se pide con
`PermissionsAndroid` para evitar el bloqueo previamente registrado en la promesa
de permisos de Expo.

**Cámara integrada (2026-09-10).** `NameplateCamera` utiliza
[`expo-camera` para Expo 54](https://docs.expo.dev/versions/v54.0.0/sdk/camera/)
porque `ImagePicker.launchCameraAsync` se bloqueaba en el Pixel sin abrir una
actividad ni devolver error. Se eliminó esa llamada y su parche de permisos
nativos; `expo-image-picker` queda para la galería. La nueva dependencia requiere
prebuild y reinstalación del cliente Android.

La cámara trasera muestra encuadre, linterna y disparador, habilitado solo tras
`onCameraReady`. La foto abre una vista previa con **Repetir fotografía** y
**Usar fotografía**. Al usarla, `useNameplateCapture` valida y copia el archivo
mediante `services/capture/photo`, persiste el checkpoint y recién entonces
llama a VisionPsy. La vista de cámara no accede a SQLite ni al motor de IA.
La aprobación de datos sigue siendo **Aceptar cambios y enviar**, después del
análisis: usar una foto no confirma sus atributos ni crea una observación.

Los permisos denegados ofrecen ajustes, reintento y galería. El arranque/disparo
tiene un límite de 20 s, se ignoran resultados cancelados y se desmonta la cámara
al previsualizar, cerrar o pasar a segundo plano. No se solicita audio para
fotografiar. El sistema conserva la captura y el análisis locales.

Validación física en Pixel 10a: apertura de la cámara trasera, disparo con JPEG
en caché y vista previa comprobados tras instalar el cliente reconstruido.
La prueba no certifica lectura de una placa real: esa precisión corresponde a
VisionPsy y a la revisión humana posterior.

El prompt de visión (`services/ai/prompts.ts`) describe cada campo en inglés
(`model → "the model name or model number printed on the plate"`), no con la
etiqueta conversacional en español: un modelo de 460M, al ver `model: el modelo`,
copiaba esa frase como valor. Se añadió la regla explícita de no copiar la
descripción del campo en `value`.

## Offline, accesibilidad y pruebas

Las fotos, WAV, snapshots y el análisis permanecen locales. Confirmar una placa
no es una sincronización. Guardar una observación crea el estado local `pending`;
el envío al servidor sigue siendo independiente. La primera descarga de cada
modelo (incluidos Silero y Bergamot) requiere red. El dev client también necesita
Metro; una APK autónoma es necesaria para validar modo avión sin computadora.

Los controles tienen etiquetas, estados accesibles y objetivos de al menos 48 dp.
El texto y las opciones de confianza pueden crecer y envolver líneas. El
historial usa scroll, el composer evita el teclado y el orb reduce su tamaño en
pantallas bajas, con teclado o texto ampliado. No se confía solo en el color.

Pruebas específicas: `ConversationScreen`, `NameplateReview`,
`nameplate-review`, `useVoiceCapture`, `useResponseDelivery`, orquestador y
adaptador QVAC. Comprueban texto/voz/foto, detección negativa e inconclusa,
confirmación obligatoria, procedencia/confianza, estados, cancelación,
checkpoint de audio, reintento y movimiento reducido. Los mocks no validan la
calidad, memoria o latencia de los modelos en hardware.

Referencia de la nueva dependencia:
[AudioRecorder](https://docs.swmansion.com/react-native-audio-api/docs/inputs/audio-recorder/)
y [compatibilidad RN](https://docs.swmansion.com/react-native-audio-api/docs/other/compatibility/).
