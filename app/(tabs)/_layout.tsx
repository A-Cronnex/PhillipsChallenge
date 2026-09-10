import { Tabs } from 'expo-router';

/**
 * The four primary sections (CLAUDE.md §13). All four are implemented.
 * Dashboard comes first: it is the screen that answers "what do we know", and
 * it is the only one that is useful without doing anything else first.
 */
export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="dashboard/index" options={{ title: 'Tablero' }} />
      <Tabs.Screen name="capture/index" options={{ title: 'Captura' }} />
      <Tabs.Screen name="map/index" options={{ title: 'Mapa' }} />
      <Tabs.Screen name="conversations/index" options={{ title: 'Agente' }} />
    </Tabs>
  );
}
