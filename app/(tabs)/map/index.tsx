import { SafeAreaView, StyleSheet } from 'react-native';

import { MapScreen } from '../../../features/maps/ui/MapScreen';

/** Map route. Thin: all behaviour lives in `features/maps/`. */
export default function MapRoute() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <MapScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
});
