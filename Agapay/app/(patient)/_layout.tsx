import { Stack } from "expo-router";

export default function PatientLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen
        name="(tabs)"
        options={{
          headerShown: false,
          headerTitle: "",
          headerBackTitle: "",
        }}
      />
    </Stack>
  );
}
