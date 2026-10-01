import { Stack } from "expo-router";

export default function ProtectedAppLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
