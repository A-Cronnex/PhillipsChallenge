import { Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, StyleSheet } from 'react-native';

import { ObservationListScreen } from '../../features/observations/ui/ObservationListScreen';

/**
 * Observation history route.
 *
 * The root layout hides the header for the tab screens
 * (app/_layout.tsx), but a pushed detail screen — reached from the map's
 * site panel — needs its own back affordance, which the Stack's built-in
 * header already provides once shown here.
 */
export default function SiteObservationsRoute() {
  const { siteId } = useLocalSearchParams<{ siteId: string }>();

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: true, title: 'Observaciones' }} />
      {siteId ? <ObservationListScreen siteId={siteId} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
});
