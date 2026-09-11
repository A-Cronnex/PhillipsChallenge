import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView } from 'expo-camera';
import { MaterialIcons } from '@expo/vector-icons';
import { AppButton } from '../../../components/ui/AppButton';
import { colors, radii, spacing, typography } from '../../../lib/theme';
import { requestCameraAccess, type CapturedPhoto } from '../../../services/capture/photo';

type CameraState =
  | { phase: 'authorizing' | 'loading' | 'ready' | 'taking' }
  | { phase: 'preview' | 'using'; photo: CapturedPhoto }
  | { phase: 'error'; message: string; permission?: boolean };

/** Native camera and temporary preview only. The capture hook owns retention and AI. */
export function NameplateCamera({ onCaptured, onCancel, onLibrary }: {
  onCaptured: (photo: CapturedPhoto) => Promise<void>;
  onCancel: () => void;
  onLibrary: () => void;
}) {
  const camera = useRef<CameraView>(null);
  const [state, setState] = useState<CameraState>({ phase: 'authorizing' });
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [torch, setTorch] = useState(false);
  const generation = useRef(0);
  const shooting = useRef(false);
  async function prepare() {
    const token = ++generation.current;
    setState({ phase: 'authorizing' });
    try {
      const granted = await requestCameraAccess();
      if (token !== generation.current) return;
      setState(granted ? { phase: 'loading' } : { phase: 'error', permission: true,
        message: 'Permite el acceso a la cámara para fotografiar la placa, o elige una foto de tu galería.' });
    } catch {
      if (token === generation.current) setState({ phase: 'error', permission: true, message: 'No se pudo acceder a la cámara. Revisa su permiso y vuelve a intentarlo.' });
    }
  }
  useEffect(() => {
    void prepare();
    const subscription = AppState.addEventListener('change', next => {
      setActive(next === 'active');
      if (next !== 'active') {
        if (shooting.current) generation.current++;
        shooting.current = false;
        setState(current => current.phase === 'taking'
          ? { phase: 'error', message: 'La captura se interrumpió al salir de la aplicación. Vuelve a intentarlo.' }
          : current.phase === 'ready' ? { phase: 'loading' } : current);
      }
    });
    return () => { generation.current++; subscription.remove(); };
  }, []);
  useEffect(() => {
    if (!active || (state.phase !== 'loading' && state.phase !== 'taking')) return;
    const timer = setTimeout(() => {
      generation.current++; shooting.current = false;
      setState({ phase: 'error', message: 'La cámara no respondió. Puedes reintentar o elegir una foto de tu galería.' });
    }, 20_000);
    return () => clearTimeout(timer);
  }, [state.phase, active]);
  async function take() {
    if (state.phase !== 'ready' || !camera.current || shooting.current) return;
    shooting.current = true;
    const token = ++generation.current;
    setState({ phase: 'taking' });
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.9 });
      if (token !== generation.current) return;
      if (!photo?.uri) throw new Error('missing photo');
      setTorch(false); setState({ phase: 'preview', photo });
    } catch {
      if (token === generation.current) setState({ phase: 'error', message: 'No se pudo tomar la fotografía. Vuelve a intentarlo.' });
    } finally { if (token === generation.current) shooting.current = false; }
  }
  async function usePhoto() {
    if (state.phase !== 'preview' || shooting.current) return;
    shooting.current = true;
    const token = generation.current;
    setState({ phase: 'using', photo: state.photo });
    try { await onCaptured(state.photo); }
    catch { if (token === generation.current) setState({ phase: 'preview', photo: state.photo }); }
    finally { if (token === generation.current) shooting.current = false; }
  }
  function close() { generation.current++; onCancel(); }
  const showCamera = active && ['loading', 'ready', 'taking'].includes(state.phase);
  return <Modal visible animationType="slide" onRequestClose={close}>
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Fotografiar placa</Text>
        <AppButton title="Cerrar" accessibilityLabel="Cerrar cámara" onPress={close} />
      </View>
      <View style={styles.viewfinder}>
        {showCamera ? <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" mode="picture" autofocus="on" enableTorch={torch}
          onCameraReady={() => setState(current => current.phase === 'loading' ? { phase: 'ready' } : current)}
          onMountError={() => setState({ phase: 'error', message: 'No se pudo iniciar la cámara. Comprueba que otra aplicación no la esté usando.' })} /> : null}
        {'photo' in state ? <Image source={{ uri: state.photo.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" accessibilityLabel="Vista previa de la fotografía" /> : null}
        {showCamera ? <View pointerEvents="none" style={styles.guide} /> : null}
        {state.phase === 'authorizing' || state.phase === 'loading' || state.phase === 'taking' || state.phase === 'using'
          ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.body} accessibilityLiveRegion="polite">
            {state.phase === 'taking' ? 'Tomando fotografía…' : state.phase === 'using' ? 'Conservando fotografía…' : 'Preparando cámara…'}
          </Text></View> : null}
        {state.phase === 'error' ? <ScrollView contentContainerStyle={styles.error}>
          <Text style={styles.body} accessibilityRole="alert">{state.message}</Text>
          {state.permission ? <AppButton title="Abrir ajustes" onPress={() => void Linking.openSettings().catch(() => {})} /> : null}
          <AppButton title="Reintentar cámara" onPress={() => void prepare()} />
        </ScrollView> : null}
      </View>
      <ScrollView style={styles.controls} contentContainerStyle={styles.controlContent}>
        <Text style={styles.body}>{'photo' in state ? 'Comprueba que las letras se vean nítidas antes de analizar la placa.' : 'Encuadra toda la placa. Evita reflejos y mantén el teléfono quieto.'}</Text>
        {state.phase === 'preview' || state.phase === 'using' ? <>
          <AppButton title="Usar fotografía" disabled={state.phase === 'using'} onPress={() => void usePhoto()} />
          <AppButton title="Repetir fotografía" disabled={state.phase === 'using'} onPress={() => { setTorch(false); setState({ phase: 'loading' }); }} />
        </> : <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel={torch ? 'Apagar linterna' : 'Encender linterna'} disabled={state.phase !== 'ready'}
            onPress={() => setTorch(value => !value)} style={styles.tool}><MaterialIcons name={torch ? 'flash-on' : 'flash-off'} size={26} color={colors.primary} /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Tomar fotografía" accessibilityState={{ disabled: state.phase !== 'ready' }}
            onPress={() => void take()} disabled={state.phase !== 'ready'} style={[styles.shutter, state.phase !== 'ready' && styles.disabled]}>
            <MaterialIcons name="photo-camera" size={32} color={colors.onPrimary} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Elegir de mis fotos" disabled={state.phase === 'taking'}
            onPress={() => { generation.current++; onLibrary(); }} style={styles.tool}><MaterialIcons name="photo-library" size={26} color={colors.primary} /></Pressable>
        </View>}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...typography.titleLarge, color: colors.onSurface, flex: 1 },
  viewfinder: { flex: 1, backgroundColor: colors.surface, marginHorizontal: spacing.md, borderRadius: radii.md, overflow: 'hidden', justifyContent: 'center' },
  guide: { position: 'absolute', left: '8%', right: '8%', top: '25%', bottom: '25%', borderWidth: 2, borderColor: colors.primary, borderRadius: radii.sm },
  loading: { alignSelf: 'center', backgroundColor: colors.scrim, padding: spacing.md, borderRadius: radii.sm, gap: spacing.sm },
  body: { ...typography.bodyMedium, color: colors.onSurface, textAlign: 'center' },
  error: { padding: spacing.lg, gap: spacing.md, flexGrow: 1, justifyContent: 'center' },
  controls: { flexGrow: 0, maxHeight: '40%' },
  controlContent: { padding: spacing.md, gap: spacing.md },
  actions: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  tool: { minWidth: 56, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  shutter: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: colors.onSurface },
  disabled: { opacity: 0.4 },
});
