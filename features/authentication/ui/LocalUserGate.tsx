import { colors } from '../../../lib/theme';
import { AppButton as Button } from '../../../components/ui/AppButton';
import { useEffect, useState, type ReactNode } from 'react';
import { View, Text } from 'react-native';
import { TextField } from '../../../components/forms/TextField';
import { LoadingState } from '../../../components/ui/ScreenStates';
import { getRepositories } from '../../../lib/container';
import { ensureDemoDataSeeded } from '../../../lib/demo-seed';

export function LocalUserGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState('loading');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      const repositories = await getRepositories();
      const hasUser = await repositories.users.getCurrentUser();
      setPhase(hasUser ? 'ready' : 'setup');
      setError('');
    } catch { setPhase('error'); setError('No se pudo abrir el almacenamiento local.'); }
  }
  useEffect(() => { void load(); }, []);
  // Fire-and-forget: seeding must not delay showing the app, and its own
  // failures are logged, not surfaced here (lib/demo-seed.ts).
  useEffect(() => {
    if (phase === 'ready') void ensureDemoDataSeeded();
  }, [phase]);
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
  return <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', padding: 24, gap: 16 }}>
    <Text style={{ fontSize: 24, color: colors.onSurface }}>Configurar este dispositivo</Text>
    <Text style={{ color: colors.onSurfaceVariant }}>Tu nombre se usará para identificar las capturas guardadas en este teléfono. Puedes trabajar sin conexión.</Text>
    <TextField label="Nombre" value={name} onChangeText={setName} />
    {error ? <Text style={{ color: colors.error }} accessibilityRole="alert">{error}</Text> : null}
    <Button title={busy ? 'Guardando…' : phase === 'error' ? 'Reintentar' : 'Guardar y comenzar'}
      disabled={busy} onPress={() => void (phase === 'error' ? load() : save())} />
  </View>;
}
