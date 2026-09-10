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
   del contrato de extracción existente. Solo `detected` y al menos un atributo
   legible habilitan la revisión. Ausencia de metadatos no equivale a detección.
3. Validar estructura, valores, rangos, campos solicitados y duplicados. Se
   mantienen los campos del catálogo marcados `visionReadable`: marca, modelo,
   modalidad y año de instalación explícito. Fabricación no equivale a instalación.
   No se introduce número de serie ni confianza numérica: no existen en el dominio.
4. Mostrar foto, campos editables y confianza alta/media/baja. Los campos que
   no pudieron leerse siguen desconocidos y se completan por conversación.
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
de permisos de Expo. La cámara nativa y VisionPsy aún requieren prueba conjunta
con placas reales; tener permiso no garantiza que una build abra la cámara.

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
