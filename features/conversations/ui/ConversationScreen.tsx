import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { AppButton } from '../../../components/ui/AppButton';
import { colors, MIN_TOUCH_TARGET, radii, spacing, typography } from '../../../lib/theme';
import type { AiRuntime, AgentActivity } from '../application/ports';
import { missingRequiredFields } from '../domain/conversation';
import { labelOf } from '../domain/fields';
import { AIVoiceOrb, AGENT_STATE_LABELS } from './AIVoiceOrb';
import { ConversationReview } from './ConversationReview';
import { NameplateReview } from './NameplateReview';
import { useConversation } from './useConversation';
import { useNameplateCapture } from './useNameplateCapture';
import { useVoiceCapture } from './useVoiceCapture';

export function ConversationScreen({ runtime, userId, photoFirst = false, onManualCapture }: {
  runtime: AiRuntime; userId: string; photoFirst?: boolean; onManualCapture?: () => void;
}) {
  const chat = useConversation({ runtime, userId });
  const [draft, setDraft] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [photoOptions, setPhotoOptions] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const history = useRef<ScrollView>(null);
  const nearBottom = useRef(true);
  const focused = useIsFocused();
  const dimensions = useWindowDimensions();
  const voice = useVoiceCapture(runtime, async (text, audioPath) => {
    setDraft(text);
    const sent = await chat.sendVoiceTranscript(text, audioPath);
    if (sent) setDraft('');
  }, chat.retainVoiceInput);
  const vision = useNameplateCapture(runtime, chat.conversation, chat.acceptPhoto, chat.retainPhotoInput);
  const ready = chat.runtimePhase === 'ready';
  const saved = chat.conversation.status === 'saved';
  const voiceActive = voice.state.phase === 'starting' || voice.state.phase === 'listening' || voice.state.phase === 'finishing';
  const visionActive = vision.state.phase !== 'idle';
  // Camera capture does not require MedPsy. Vision loads through its own port
  // after the local image exists, including on a fresh/offline installation.
  const cameraDisabled = chat.busy || voiceActive || visionActive || saved;
  const disabled = chat.busy || voiceActive || visionActive || saved || !ready;
  const partial = 'partial' in voice.state ? voice.state.partial : '';
  const activity: AgentActivity = voice.state.phase === 'listening' ? 'listening'
    : chat.activity !== 'idle' ? chat.activity
    : voiceActive || vision.state.phase === 'processing' || chat.runtimePhase === 'preparing' ? 'thinking' : 'idle';
  const compact = keyboardOpen || dimensions.height < 760 || dimensions.fontScale > 1.3;
  const status = chat.runtimePhase === 'preparing' ? 'Preparando el agente'
    : voice.state.phase === 'starting' ? 'Preparando el micrófono'
    : voice.state.phase === 'finishing' && chat.activity === 'idle' ? 'Terminando la transcripción'
    : !ready ? 'Tu asistente de campo' : saved ? 'Observación guardada' : AGENT_STATE_LABELS[activity];
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  useEffect(() => { if (!focused) { voice.cancel(); chat.finishDelivery(); } }, [focused]);
  useEffect(() => {
    if (voice.state.phase === 'listening') {
      nearBottom.current = false;
      history.current?.scrollTo({ y: 0, animated: false });
    }
  }, [voice.state.phase]);
  useEffect(() => {
    if (chat.delivery) { nearBottom.current = true; history.current?.scrollToEnd({ animated: false }); }
  }, [chat.delivery?.turnIndex]);
  const photoOpened = useRef(false);
  useEffect(() => {
    if (photoFirst && ready && !chat.busy && !photoOpened.current) { photoOpened.current = true; setPhotoOptions(true); }
  }, [photoFirst, ready, chat.busy]);
  async function send() {
    if (!draft.trim() || disabled) return;
    const text = draft.trim();
    Keyboard.dismiss();
    if (await chat.sendText(text)) setDraft('');
  }
  const reviewProposal = 'proposal' in vision.state ? vision.state.proposal : undefined;
  const reviewError = vision.state.phase === 'error' ? vision.state.message : undefined;
  return <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {reviewing ? <ConversationReview conversation={chat.conversation} onCancel={() => setReviewing(false)} onSaved={() => { chat.markSaved(); setReviewing(false); }} />
        : reviewProposal ? <NameplateReview key={reviewProposal.imagePath} proposal={reviewProposal} busy={vision.state.phase === 'submitting'} error={reviewError}
          onAccept={edits => void vision.accept(edits)} onCancel={vision.cancel} />
        : <View style={styles.column}>
          <View style={styles.header}>
            <View style={styles.headerText}><Text style={styles.eyebrow}>ASISTENTE DE CAMPO</Text><Text style={styles.title}>Una conversación, un registro</Text></View>
            {onManualCapture ? <Pressable accessibilityRole="button" accessibilityLabel="Abrir la captura manual" disabled={chat.busy || voiceActive || visionActive}
              onPress={onManualCapture} style={styles.iconButton}><MaterialIcons name="edit-note" size={26} color={colors.onSurfaceVariant} /></Pressable> : null}
          </View>
          <ScrollView ref={history} style={styles.history} contentContainerStyle={styles.historyContent} keyboardShouldPersistTaps="handled"
            onScroll={event => { const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent; nearBottom.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 100; }} scrollEventThrottle={100}
            onContentSizeChange={() => { if (nearBottom.current && (!voiceActive || chat.delivery) && chat.conversation.turns.length) history.current?.scrollToEnd({ animated: false }); }}>
            <View style={styles.hero}>
              <AIVoiceOrb state={activity} compact={compact} active={focused} />
              <Text style={styles.status} accessibilityLiveRegion="polite">{status}</Text>
              {voice.state.phase === 'listening' || voice.state.phase === 'finishing'
                ? <Text style={styles.partial} testID="partial-transcript" accessibilityLiveRegion="polite">{partial || 'Habla con naturalidad. El texto aparecerá aquí.'}</Text>
                : <Text style={styles.subtitle}>{ready ? 'Cuéntame qué equipo tienes delante.' : 'Habla, escribe o fotografía la placa del equipo.'}</Text>}
              <View style={styles.localBadge}><MaterialIcons name="phonelink-lock" size={14} color={colors.onSurfaceVariant} /><Text style={styles.localText}>Análisis local · Fotos y audio privados</Text></View>
              <Pressable onPress={() => setPhotoOptions(value => !value)} disabled={cameraDisabled}
                accessibilityRole="button" accessibilityLabel="Capturar placa con cámara" accessibilityState={{ disabled: cameraDisabled, expanded: photoOptions }}
                style={[styles.camera, cameraDisabled && styles.disabled]}>
                <MaterialIcons name="photo-camera" size={23} color={colors.primary} /><Text style={styles.cameraLabel}>Capturar placa con cámara</Text>
                <MaterialIcons name="chevron-right" size={20} color={colors.onSurfaceVariant} />
              </Pressable>
              {photoOptions && !cameraDisabled ? <View style={styles.actions}>
                <AppButton title="Tomar fotografía" onPress={() => { setPhotoOptions(false); void vision.capture('camera'); }} />
                <AppButton title="Elegir de mis fotos" onPress={() => { setPhotoOptions(false); void vision.capture('library'); }} />
              </View> : null}
            </View>
            {!ready ? <View style={styles.card}>
              <Text style={styles.cardTitle}>Inteligencia en tu dispositivo</Text>
              <Text style={styles.body}>Prepara los modelos con conexión antes de salir a campo. Una vez descargados, puedes capturar sin internet.</Text>
              {chat.runtimeError ? <Text style={styles.error} accessibilityRole="alert">{chat.runtimeError}</Text> : null}
              {chat.runtimePhase === 'preparing' ? <ActivityIndicator color={colors.primary} accessibilityLabel="Cargando modelos" />
                : <AppButton title={chat.runtimePhase === 'unavailable' ? 'Reintentar carga de modelos' : 'Preparar agente'} disabled={chat.busy || voiceActive || visionActive} onPress={() => void chat.prepare()} />}
              {onManualCapture ? <Pressable accessibilityRole="button" onPress={onManualCapture} style={styles.textButton}><Text style={styles.link}>Continuar con captura manual</Text></Pressable> : null}
            </View> : null}
            {vision.state.phase === 'capturing' || vision.state.phase === 'processing' ? <View style={styles.card}>
              {'imagePath' in vision.state ? <Image source={{ uri: vision.state.imagePath }} style={styles.preview} resizeMode="contain" accessibilityLabel="Fotografía seleccionada" /> : null}
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.body} accessibilityLiveRegion="polite">{vision.state.phase === 'capturing' ? 'Abriendo captura de imagen…' : 'Comprobando la placa y leyendo sus datos en el dispositivo…'}</Text>
              <AppButton title="Cancelar y volver al chat" onPress={vision.cancel} />
            </View> : null}
            {vision.state.phase === 'error' ? <View style={styles.card}>
              <Text style={styles.error} accessibilityRole="alert">{vision.state.message}</Text>
              {vision.state.imagePath ? <AppButton title="Reintentar análisis" onPress={() => void vision.retry()} /> : null}
              <AppButton title="Elegir otra foto" onPress={() => void vision.capture('library')} />
              <AppButton title="Volver al chat" onPress={vision.cancel} />
            </View> : null}
            <View style={styles.divider}><Text style={styles.eyebrow}>CONVERSACIÓN</Text><View style={styles.line} /></View>
            {!chat.conversation.turns.length ? <View style={styles.agentBubble}>
              <Text style={styles.turnLabel}>ASISTENTE</Text><Text style={styles.message}>Comencemos con el equipo y el lugar de la visita. Por ejemplo: «Hay dos monitores en la clínica».</Text>
            </View> : null}
            {chat.conversation.turns.map((turn, index) => <View key={`${index}-${turn.at}`} style={[styles.bubble, turn.role === 'user' ? styles.userBubble : styles.agentBubble]}>
              <Text style={styles.turnLabel}>{turn.role === 'user' ? 'TÚ' : 'ASISTENTE'}{turn.source === 'voice' ? ' · VOZ' : turn.source === 'image' ? ' · PLACA' : ''}</Text>
              {turn.source === 'image' && turn.reference ? <Image source={{ uri: turn.reference }} style={styles.turnImage} accessibilityLabel="Placa revisada y enviada" /> : null}
              {turn.role === 'agent' && turn.capturedSummary ? <Text style={styles.capturedSummary}>{turn.capturedSummary}</Text> : null}
              <Text style={styles.message} selectable accessibilityLabel={turn.text}
                accessibilityLiveRegion={turn.role === 'agent' && chat.delivery?.turnIndex !== index ? 'polite' : 'none'}
                testID={turn.role === 'agent' ? `agent-message-${index}` : undefined}>
                {chat.delivery?.turnIndex === index ? chat.delivery.text || '…' : turn.text}
              </Text>
            </View>)}
            {chat.error ? <View style={styles.card}><Text style={styles.error} accessibilityRole="alert">{chat.error}</Text>
              <AppButton title="Reintentar último mensaje" disabled={disabled} onPress={() => void chat.retryLast()} /></View> : null}
            {chat.warning ? <Text style={styles.warning} accessibilityLiveRegion="polite">{chat.warning}</Text> : null}
            {voice.state.phase === 'error' ? <View style={styles.card}><Text style={styles.error} accessibilityRole="alert">{voice.state.message}</Text>
              {voice.state.audioPath ? <AppButton title="Reintentar transcripción del audio" disabled={disabled} onPress={() => { if (voice.state.phase === 'error' && voice.state.audioPath) void chat.sendVoice(voice.state.audioPath); }} /> : null}</View> : null}
            {saved ? <View style={styles.card}><Text style={styles.cardTitle}>Guardada en este dispositivo</Text><Text style={styles.body}>Pendiente de sincronización. Puedes continuar trabajando sin conexión.</Text>
              <AppButton title="Nueva conversación" disabled={chat.busy} onPress={() => void chat.newConversation()} /></View>
              : chat.conversation.turns.length > 0 ? <View style={styles.card}>
                <Text style={styles.body}>{missingRequiredFields(chat.conversation).length ? `Por completar: ${missingRequiredFields(chat.conversation).map(labelOf).join(', ')}.` : 'La información está lista para tu revisión final.'}</Text>
                <AppButton title="Revisar y guardar observación" disabled={chat.busy || voiceActive || visionActive} onPress={() => setReviewing(true)} />
              </View> : null}
          </ScrollView>
          <View style={styles.composerArea}>
            {voiceActive && chat.activity === 'idle' ? <Pressable accessibilityRole="button" accessibilityLabel="Cancelar grabación" onPress={voice.cancel} style={styles.textButton}><Text style={styles.link}>Cancelar grabación</Text></Pressable> : null}
            <View style={styles.composer}>
              <TextInput value={draft} onChangeText={setDraft} placeholder="Escribe un mensaje…" placeholderTextColor={colors.onSurfaceVariant}
                accessibilityLabel="Mensaje para el agente" multiline editable={!disabled} style={styles.input} maxLength={4000} />
              <Pressable onPress={() => void (voice.state.phase === 'listening' ? voice.stop() : voice.start())}
                disabled={voice.state.phase !== 'listening' && disabled} style={[styles.mic, voice.state.phase === 'listening' && styles.recording]}
                accessibilityRole="button" accessibilityLabel={voice.state.phase === 'listening' ? 'Terminar grabación y enviar' : 'Hablar con el agente'}
                accessibilityState={{ disabled: voice.state.phase !== 'listening' && disabled }}>
                <MaterialIcons name={voice.state.phase === 'listening' ? 'stop' : 'mic'} size={24} color={colors.onPrimary} />
              </Pressable>
              {draft.trim() ? <Pressable accessibilityRole="button" accessibilityLabel="Enviar mensaje" disabled={disabled} onPress={() => void send()} style={styles.iconButton}>
                <MaterialIcons name="arrow-upward" size={24} color={disabled ? colors.disabled : colors.primary} />
              </Pressable> : null}
            </View>
          </View>
        </View>}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  column: { flex: 1, width: '100%', maxWidth: 800, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  headerText: { flex: 1, gap: spacing.xs },
  eyebrow: { ...typography.labelMedium, color: colors.onSurfaceVariant, letterSpacing: 1.4 },
  title: { ...typography.titleMedium, color: colors.onSurface },
  history: { flex: 1 },
  historyContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
  hero: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm },
  status: { ...typography.titleLarge, color: colors.onSurface, textAlign: 'center' },
  subtitle: { ...typography.bodyMedium, color: colors.onSurfaceVariant, textAlign: 'center', lineHeight: 21 },
  partial: { ...typography.bodyLarge, fontWeight: '400', color: colors.onSurfaceVariant, textAlign: 'center', lineHeight: 24, paddingHorizontal: spacing.sm },
  localBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs },
  localText: { ...typography.bodyMedium, fontSize: 12, color: colors.onSurfaceVariant, flexShrink: 1 },
  camera: { minHeight: 56, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.border, marginTop: spacing.sm },
  cameraLabel: { ...typography.titleMedium, color: colors.onSurface, flex: 1 },
  disabled: { opacity: 0.45 },
  actions: { gap: spacing.sm, alignSelf: 'stretch' },
  card: { borderRadius: radii.md, backgroundColor: colors.glass, padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  cardTitle: { ...typography.titleMedium, color: colors.onSurface },
  body: { ...typography.bodyMedium, color: colors.onSurfaceVariant, lineHeight: 21 },
  error: { ...typography.bodyMedium, color: colors.error, lineHeight: 21 },
  warning: { ...typography.bodyMedium, color: colors.pending },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.sm },
  line: { height: 1, backgroundColor: colors.border, flex: 1 },
  bubble: { maxWidth: '94%', padding: spacing.md, gap: spacing.sm, borderRadius: radii.md },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.surfaceVariant, borderBottomRightRadius: 6 },
  agentBubble: { alignSelf: 'flex-start', padding: spacing.md, gap: spacing.sm, borderRadius: radii.md, borderBottomLeftRadius: 6, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.border },
  turnLabel: { ...typography.labelMedium, color: colors.onSurfaceVariant, letterSpacing: 0.8 },
  // Smaller than the message itself: a status indicator of what has been
  // captured so far, not part of what the agent "says" (product requirement).
  capturedSummary: { ...typography.labelMedium, fontWeight: '400', color: colors.onSurfaceVariant, lineHeight: 16 },
  message: { ...typography.bodyLarge, color: colors.onSurface, lineHeight: 24 },
  preview: { width: '100%', height: 150, borderRadius: radii.sm },
  turnImage: { width: 140, height: 100, borderRadius: radii.sm },
  composerArea: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  composer: { flexDirection: 'row', alignItems: 'flex-end', padding: spacing.sm, gap: spacing.xs, backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border },
  input: { flex: 1, color: colors.onSurface, ...typography.bodyLarge, minHeight: MIN_TOUCH_TARGET, maxHeight: 140, paddingHorizontal: spacing.sm, paddingVertical: 12 },
  mic: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  recording: { backgroundColor: colors.error },
  iconButton: { width: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  textButton: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', alignItems: 'center' },
  link: { ...typography.bodyMedium, color: colors.primary },
});
