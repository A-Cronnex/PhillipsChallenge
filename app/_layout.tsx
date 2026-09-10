import { LocalUserGate } from '../features/authentication/ui/LocalUserGate';
import { Stack } from 'expo-router';

export default function RootLayout() {
  return <LocalUserGate><Stack screenOptions={{ headerShown: false }} /></LocalUserGate>;
}
