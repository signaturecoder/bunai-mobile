import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="diagnostics" options={{ title: 'Diagnostics' }} />
      <Stack.Screen name="design/[id]" options={{ title: 'Design' }} />
      <Stack.Screen name="mod/[id]" options={{ title: 'MOD Details' }} />
    </Stack>
  );
}
