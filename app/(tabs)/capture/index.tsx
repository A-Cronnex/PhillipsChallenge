import { SafeAreaView, StyleSheet } from 'react-native';

import { ObservationCaptureForm } from '../../../features/observations/ui/ObservationCaptureForm';

/**
 * Capture route.
 *
 * Route files stay thin: they mount a feature screen and nothing else. All
 * capture behaviour lives in `features/observations/`
 * (docs/architecture.md §5).
 */
export default function CaptureScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ObservationCaptureForm />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
});
