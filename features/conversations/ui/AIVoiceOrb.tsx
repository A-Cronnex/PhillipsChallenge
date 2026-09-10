import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { AgentActivity } from '../application/ports';
import { colors } from '../../../lib/theme';

export const AGENT_STATE_LABELS: Record<AgentActivity, string> = {
  idle: 'Listo para escucharte', listening: 'Te estoy escuchando', thinking: 'Analizando tu información', responding: 'Preparando la respuesta',
};

export function AIVoiceOrb({ state, compact = false, active = true }: { state: AgentActivity; compact?: boolean; active?: boolean }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [reducedMotion, setReducedMotion] = useState(true);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReducedMotion(value); }).catch(() => {});
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { mounted = false; listener.remove(); };
  }, []);
  useEffect(() => {
    progress.setValue(0);
    if (reducedMotion || !active) return;
    const duration = state === 'idle' ? 3200 : state === 'thinking' ? 2300 : state === 'listening' ? 1100 : 1600;
    const motion = Animated.loop(Animated.sequence([
      Animated.timing(progress, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
      Animated.timing(progress, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
    ]));
    motion.start();
    return () => motion.stop();
  }, [state, reducedMotion, active, progress]);
  const size = compact ? 94 : 134;
  const amplitude = state === 'idle' ? 1.035 : state === 'listening' ? 1.13 : 1.07;
  return <View style={[styles.container, { width: size + 52, height: size + 44 }]} testID={`ai-orb-${state}`}
    accessible accessibilityRole="image" accessibilityLabel={`Agente: ${AGENT_STATE_LABELS[state]}`}>
    {[1.5, 1.3, 1.13].map((scale, index) => <Animated.View key={scale} style={[styles.halo,
      { width: size, height: size, borderRadius: size, opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.035 + index * 0.015, 0.075 + index * 0.025] }),
        transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [scale, scale + (state === 'listening' ? 0.15 : 0.035)] }) }] }]} />)}
    <Animated.View style={[styles.orb, { width: size, height: size, borderRadius: size,
      transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, amplitude] }) },
        { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', state === 'thinking' ? '30deg' : '8deg'] }) }] }]}>
      <View style={[styles.light, { width: size * 0.9, height: size * 0.9, borderRadius: size }]} />
      <View style={[styles.inner, { width: size * 0.7, height: size * 0.7, borderRadius: size }]} />
      <MaterialIcons name={state === 'listening' ? 'graphic-eq' : 'auto-awesome'} size={compact ? 30 : 40} color={colors.onSurface} />
    </Animated.View>
  </View>;
}
const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  halo: { position: 'absolute', backgroundColor: colors.glow, borderColor: colors.primary, borderWidth: 1 },
  orb: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#284978', borderWidth: 1,
    borderColor: 'rgba(205,225,255,0.5)', overflow: 'hidden', shadowColor: colors.glow, shadowOpacity: 0.3, shadowRadius: 24 },
  light: { position: 'absolute', top: -20, left: -12, backgroundColor: 'rgba(160,201,255,0.18)' },
  inner: { position: 'absolute', bottom: -16, right: -8, backgroundColor: 'rgba(8,19,43,0.3)' },
});
