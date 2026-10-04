import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';

interface TherapistLocationMarkerProps {
    /** Background color for the main marker */
    backgroundColor?: string;
    /** Size of the main marker (width and height) */
    size?: number;
    /** Whether to show the pulsating animation */
    animated?: boolean;
}

/**
 * Animated therapist location marker with pulsating rings
 * Provides consistent visual feedback for real-time location sharing
 */
export function TherapistLocationMarker({
    backgroundColor = "#10B981",
    size = 20,
    animated = true,
}: TherapistLocationMarkerProps) {
    const pulseAnim1 = useRef(new Animated.Value(0.8)).current;
    const pulseAnim2 = useRef(new Animated.Value(0.8)).current;
    const opacityAnim1 = useRef(new Animated.Value(0.8)).current;
    const opacityAnim2 = useRef(new Animated.Value(0.6)).current;

    useEffect(() => {
        if (!animated) return;

        // Create Apple Maps-style pulsating animation
        const createApplePulseAnimation = (scaleAnim: Animated.Value, opacityAnim: Animated.Value, delay = 0) => {
            return Animated.loop(
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.parallel([
                        Animated.timing(scaleAnim, {
                            toValue: 1.2,
                            duration: 1500,
                            useNativeDriver: true,
                        }),
                        Animated.timing(opacityAnim, {
                            toValue: 0,
                            duration: 1500,
                            useNativeDriver: true,
                        }),
                    ]),
                    Animated.parallel([
                        Animated.timing(scaleAnim, {
                            toValue: 0.8,
                            duration: 0,
                            useNativeDriver: true,
                        }),
                        Animated.timing(opacityAnim, {
                            toValue: 0.8,
                            duration: 0,
                            useNativeDriver: true,
                        }),
                    ]),
                ])
            );
        };

        // Start both animations with different delays for Apple Maps effect
        const animation1 = createApplePulseAnimation(pulseAnim1, opacityAnim1, 0);
        const animation2 = createApplePulseAnimation(pulseAnim2, opacityAnim2, 750);

        animation1.start();
        animation2.start();

        return () => {
            animation1.stop();
            animation2.stop();
        };
    }, [animated, pulseAnim1, pulseAnim2, opacityAnim1, opacityAnim2]);

    const pulseSize1 = size * 2;
    const pulseSize2 = size * 2.5;

    return (
        <View style={[styles.container, { width: pulseSize2, height: pulseSize2 }]}>
            {/* Outer pulsating ring */}
            {animated && (
                <Animated.View
                    style={[
                        styles.pulseRing,
                        {
                            width: pulseSize2,
                            height: pulseSize2,
                            borderRadius: pulseSize2 / 2,
                            backgroundColor: `${backgroundColor}30`, // 30% opacity
                            transform: [{ scale: pulseAnim2 }],
                            opacity: opacityAnim2,
                            top: 0,
                            left: 0,
                        },
                    ]}
                />
            )}

            {/* Inner pulsating ring */}
            {animated && (
                <Animated.View
                    style={[
                        styles.pulseRing,
                        {
                            width: pulseSize1,
                            height: pulseSize1,
                            borderRadius: pulseSize1 / 2,
                            backgroundColor: `${backgroundColor}50`, // 50% opacity
                            transform: [{ scale: pulseAnim1 }],
                            opacity: opacityAnim1,
                            top: (pulseSize2 - pulseSize1) / 2,
                            left: (pulseSize2 - pulseSize1) / 2,
                        },
                    ]}
                />
            )}

            {/* Main marker */}
            <View
                style={[
                    styles.mainMarker,
                    {
                        width: size,
                        height: size,
                        borderRadius: size / 2,
                        backgroundColor,
                        top: (pulseSize2 - size) / 2,
                        left: (pulseSize2 - size) / 2,
                    },
                ]}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'relative',
        justifyContent: 'center',
        alignItems: 'center',
    },
    pulseRing: {
        position: 'absolute',
    },
    mainMarker: {
        position: 'absolute',
        borderWidth: 3,
        borderColor: '#FFFFFF',
        shadowColor: '#10B981',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 4,
        elevation: 8,
        zIndex: 1000,
    },
});