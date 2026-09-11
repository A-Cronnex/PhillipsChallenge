import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../../../lib/theme';
import type { SiteSummary } from '../../sites/application/ports';

/**
 * Site identity for the observation-history screen: name as the primary
 * title, country/city as secondary information — both read straight from
 * `Site` (docs/domain-model.md §4), nothing computed or inferred.
 */
export function SiteHeader({ site }: { site: SiteSummary }) {
  const location = [site.city, site.country].filter(Boolean).join(' · ');
  return (
    <View style={styles.container} testID="site-header">
      <Text style={styles.name}>{site.name}</Text>
      <Text style={styles.location}>{location || 'Ubicación sin detalle'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.xs },
  name: { ...typography.titleLarge, color: colors.onSurface },
  location: { ...typography.bodyMedium, color: colors.onSurfaceVariant },
});
