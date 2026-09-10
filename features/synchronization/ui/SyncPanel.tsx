import { colors } from '../../../lib/theme';
import { useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { isSyncConfigured } from '../../../services/sync/config';
import { getSyncToken, setSyncToken } from '../../../services/sync/session';

/**
 * Synchronization credential entry.
 *
 * The action itself lives in the header's SyncIconButton
 * (features/synchronization/ui/SyncIconButton.tsx) — a corner icon, per
 * product decision, rather than a button in this panel. This is only the
 * credential field: `setSyncToken`/`getSyncToken` are plain module functions
 * (services/sync/session.ts), not React state, so the icon button reads
 * whatever was last typed here with no state shared between the two.
 *
 * The "Sincronización" title lives beside the icon button in the dashboard's
 * top bar (features/dashboard/ui/DashboardScreen.tsx), not here, per product
 * decision — one title for the whole sync affordance, not one per piece.
 */
export function SyncPanel() {
  const [token, setToken] = useState(getSyncToken);
  return <View style={{ padding: 16, gap: 8 }}>
    {isSyncConfigured() ? <>
      <Text style={{ color: colors.onSurfaceVariant }}>La credencial se conserva solo mientras la aplicación está abierta.</Text>
      <TextInput accessibilityLabel="Credencial de sincronización" placeholder="Credencial" secureTextEntry
        autoCapitalize="none" autoCorrect={false} value={token}
        onChangeText={value => { setToken(value); setSyncToken(value); }}
        placeholderTextColor={colors.onSurfaceVariant} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, color: colors.onSurface, backgroundColor: colors.surface }} />
    </> : <Text style={{ color: colors.onSurfaceVariant }}>Sin servidor configurado. Captura disponible sin conexión.</Text>}
  </View>;
}
