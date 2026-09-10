import { MaterialIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

/**
 * Primary sections.
 *
 * Dashboard comes first: it is the screen that answers "what do we know", and
 * it is the only one that is useful without doing anything else first.
 *
 * Capture hosts the agent. CLAUDE.md §13 lists Conversations as a fourth
 * section; it was removed on the user's instruction once Capture became the
 * agent's entry point, since keeping it meant reaching the same live agent
 * from two tabs. No conversation history list existed, so nothing that was
 * reachable before is unreachable now (docs/ai-agent-implementation.md).
 */
export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen
        name="dashboard/index"
        options={{
          title: 'Tablero',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="dashboard" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="capture/index"
        options={{
          title: 'Captura',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="mic" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="map/index"
        options={{
          title: 'Mapa',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="map" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
