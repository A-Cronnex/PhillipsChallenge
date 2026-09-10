import { useEffect, useState, type ReactNode } from 'react';
import { View, Text, Button } from 'react-native';
import { TextField } from '../../../components/forms/TextField';
import { LoadingState } from '../../../components/ui/ScreenStates';
import { getRepositories } from '../../../lib/container';

export function LocalUserGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState('loading');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      const repositories = await getRepositories();
      setPhase(await repositories.users.getCurrentUser() ? 'ready' : 'setup');
      setError('');
    } catch { setPhase('error'); setError('No se pudo abrir el almacenamiento local.'); }
  }
  useEffect(() => { void load(); }, []);
  if (phase === 'loading') return <LoadingState message="Abriendo datos locales…" />;
  if (phase === 'ready') return <>{children}</>;
  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      await (await getRepositories()).catalog.createLocalUser(name);
      setPhase('ready');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo guardar.'); }
    finally { setBusy(false); }
  }
  return <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
    <Text style={{ fontSize: 24 }}>Configurar este dispositivo</Text>
    <Text>Tu nombre se usará para identificar las capturas guardadas en este teléfono. Puedes trabajar sin conexión.</Text>
    <TextField label="Nombre" value={name} onChangeText={setName} />
    {error ? <Text accessibilityRole="alert">{error}</Text> : null}
    <Button title={busy ? 'Guardando…' : phase === 'error' ? 'Reintentar' : 'Guardar y comenzar'}
      disabled={busy} onPress={() => void (phase === 'error' ? load() : save())} />
  </View>;
}
