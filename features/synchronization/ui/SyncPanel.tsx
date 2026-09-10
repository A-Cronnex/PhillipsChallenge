import { useRef, useState } from 'react';
import { View, Text, TextInput, Button } from 'react-native';
import { getRepositories } from '../../../lib/container';
import { isSyncConfigured } from '../../../services/sync/config';
import { getSyncToken, setSyncToken } from '../../../services/sync/session';
import { runSynchronization } from '../application/synchronize';

export function SyncPanel({ onComplete }: { onComplete: () => void | Promise<void> }) {
  const [token, setToken] = useState(getSyncToken);
  const [identity, setIdentity] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function identify() {
    try {
      const r = await getRepositories();
      const user = await r.users.getCurrentUser();
      const device = await r.deviceIdentity.getOrCreateDeviceId(new Date().toISOString());
      setIdentity(`Usuario: ${user?.id ?? 'Sin usuario'}\nDispositivo: ${device}`);
    } catch { setMessage('No se pudieron leer los identificadores.'); }
  }
  async function sync() {
    if (lock.current) return;
    if (isSyncConfigured() && !token.trim()) { setMessage('Introduce la credencial asignada a este dispositivo.'); return; }
    lock.current = true; setBusy(true); setMessage(''); setSyncToken(token);
    try {
      const r = await getRepositories();
      const report = await runSynchronization({ queue: r.syncQueue, transport: r.syncTransport,
        deviceId: await r.deviceIdentity.getOrCreateDeviceId(new Date().toISOString()), now: () => new Date() });
      setMessage(report.status === 'not_configured' ? 'Sin servidor configurado. Tus datos permanecen pendientes en este teléfono.'
        : report.status === 'nothing_pending' ? 'No hay cambios pendientes.'
        : `${report.synchronized} sincronizados; ${report.rejected.length} rechazados; ${report.conflicts.length} conflictos resueltos usando la versión de este dispositivo. ${report.transportError ?? ''}`);
      await onComplete();
    } catch { setMessage('No se pudo completar la sincronización. Puedes reintentar.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <View style={{ padding: 16, gap: 8 }}>
    <Text style={{ fontSize: 18 }}>Sincronización</Text>
    {isSyncConfigured() ? <>
      <Text>La credencial se conserva solo mientras la aplicación está abierta.</Text>
      <TextInput accessibilityLabel="Credencial de sincronización" placeholder="Credencial" secureTextEntry
        autoCapitalize="none" autoCorrect={false} value={token} editable={!busy} onChangeText={setToken}
        style={{ borderWidth: 1, padding: 12 }} />
    </> : <Text>Sin servidor configurado. Captura disponible sin conexión.</Text>}
    <Button title={busy ? 'Sincronizando…' : 'Sincronizar ahora'} disabled={busy} onPress={() => void sync()} />
    <Button title="Mostrar identificadores para configurar acceso" onPress={() => void identify()} />
    {identity ? <Text selectable>{identity}</Text> : null}
    {message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}
  </View>;
}
