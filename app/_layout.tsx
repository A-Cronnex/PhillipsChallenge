import { LocalUserGate } from '../features/authentication/ui/LocalUserGate';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Appearance } from 'react-native';
import { colors } from '../lib/theme';

Appearance.setColorScheme('dark');

export default function RootLayout() {
  return <><StatusBar style="light" /><LocalUserGate><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} /></LocalUserGate></>;
}
