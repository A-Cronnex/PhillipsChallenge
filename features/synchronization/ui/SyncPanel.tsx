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
 */
export function SyncPanel() {
  const [token, setToken] = useState(getSyncToken);
  return <View style={{ padding: 16, gap: 8 }}>
    <Text style={{ fontSize: 18 }}>Sincronización</Text>
    {isSyncConfigured() ? <>
      <Text>La credencial se conserva solo mientras la aplicación está abierta.</Text>
      <TextInput accessibilityLabel="Credencial de sincronización" placeholder="Credencial" secureTextEntry
        autoCapitalize="none" autoCorrect={false} value={token}
        onChangeText={value => { setToken(value); setSyncToken(value); }}
        style={{ borderWidth: 1, padding: 12 }} />
    </> : <Text>Sin servidor configurado. Captura disponible sin conexión.</Text>}
  </View>;
}
