import { Tabs } from 'expo-router';

/**
 * The four primary sections (CLAUDE.md §13). Capture, Map and Conversations
 * are implemented; Dashboard is not declared here rather than being stubbed, so
 * the tab bar does not advertise a screen that does not exist.
 */
export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="capture/index" options={{ title: 'Captura' }} />
      <Tabs.Screen name="map/index" options={{ title: 'Mapa' }} />
      <Tabs.Screen name="conversations/index" options={{ title: 'Agente' }} />
    </Tabs>
  );
}
