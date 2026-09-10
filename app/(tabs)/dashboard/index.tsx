import { SafeAreaView, StyleSheet } from 'react-native';

import { DashboardScreen } from '../../../features/dashboard/ui/DashboardScreen';

/** Dashboard route. Thin: all behaviour lives in `features/dashboard/`. */
export default function DashboardRoute() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <DashboardScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
});
