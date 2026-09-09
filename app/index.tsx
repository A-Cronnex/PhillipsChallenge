import { Redirect } from 'expo-router';

/** Capture is the app's entry point until the other sections exist. */
export default function Index() {
  return <Redirect href="/(tabs)/capture" />;
}
