import { Stack } from 'expo-router';

export default function TherapistLayout() {
    return (
        <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
                name="select-conditions"
                options={{
                    headerShown: false,
                    presentation: 'card'
                }}
            />
            <Stack.Screen
                name="select-specializations"
                options={{
                    headerShown: false,
                    presentation: 'card'
                }}
            />
            <Stack.Screen
                name="select-service-areas"
                options={{
                    headerShown: false,
                    presentation: 'card'
                }}
            />
            <Stack.Screen
                name="colleagues"
                options={{
                    headerShown: false,
                    presentation: 'card'
                }}
            />
            <Stack.Screen
                name="edit-therapist-profile"
                options={{
                    headerShown: false,
                    presentation: 'card'
                }}
            />
            <Stack.Screen
                name="schedule"
                options={{
                    headerShown: false,
                    presentation: 'card'
                }}
            />
            <Stack.Screen
                name="add-time-block"
                options={{
                    headerShown: false,
                    presentation: 'card'
                }}
            />
            <Stack.Screen
                name="sessions"
                options={{
                    headerShown: false,
                    presentation: 'card'
                }}
            />
            <Stack.Screen
                name="all-sessions"
                options={{
                    headerShown: false,
                    presentation: 'card'
                }}
            />
            <Stack.Screen
                name="upcoming-sessions"
                options={{
                    headerShown: false,
                    presentation: 'card'
                }}
            />
            <Stack.Screen
                name="notifications"
                options={{
                    headerShown: false,
                    presentation: 'card'
                }}
            />
            <Stack.Screen
                name="edit-service-area"
                options={{
                    headerShown: false,
                    presentation: 'card'
                }}
            />
            <Stack.Screen
                name="onboarding"
                options={{
                    headerShown: false,
                    presentation: 'modal'
                }}
            />
        </Stack>
    );
}
