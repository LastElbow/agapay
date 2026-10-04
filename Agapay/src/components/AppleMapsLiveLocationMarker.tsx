import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';

interface AppleMapsliveLocationMarkerProps {
    /** Whether this is the user's own location (therapist) or someone else's (patient view) */
    isOwnLocation?: boolean;
    /** Size of the main marker */
    size?: number;
}

/**
 * Apple Maps-style live location marker with pulsating rings and direction arrow for own location
 */
export function AppleMapsLiveLocationMarker({
    isOwnLocation = false,
    size = 16,
}: AppleMapsliveLocationMarkerProps) {
    const pulseAnim1 = useRef(new Animated.Value(0.8)).current;
    const pulseAnim2 = useRef(new Animated.Value(0.8)).current;
    const opacityAnim1 = useRef(new Animated.Value(0.7)).current;
    const opacityAnim2 = useRef(new Animated.Value(0.5)).current;

    useEffect(() => {
        // Create Apple Maps-style pulsating animation
        const createApplePulseAnimation = (scaleAnim: Animated.Value, opacityAnim: Animated.Value, delay = 0) => {
            return Animated.loop(
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.parallel([
                        Animated.timing(scaleAnim, {
                            toValue: isOwnLocation ? 1.3 : 1.2,
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
                            toValue: isOwnLocation ? 0.7 : 0.8,
                            duration: 0,
                            useNativeDriver: true,
                        }),
                    ]),
                ])
            );
        };

        // Start animations with Apple Maps timing
        const animation1 = createApplePulseAnimation(pulseAnim1, opacityAnim1, 0);
        const animation2 = createApplePulseAnimation(pulseAnim2, opacityAnim2, 750);

        animation1.start();
        animation2.start();

        return () => {
            animation1.stop();
            animation2.stop();
        };
    }, [isOwnLocation, pulseAnim1, pulseAnim2, opacityAnim1, opacityAnim2]);

    const containerSize = isOwnLocation ? 44 : 40;
    const pulseSize1 = isOwnLocation ? 34 : 30;
    const pulseSize2 = isOwnLocation ? 44 : 40;
    const markerSize = isOwnLocation ? 20 : size;

    return (
        <View style={[styles.container, { width: containerSize, height: containerSize }]}>
            {/* Outer pulsating ring */}
            <Animated.View
                style={[
                    styles.pulseRing,
                    {
                        width: pulseSize2,
                        height: pulseSize2,
                        borderRadius: pulseSize2 / 2,
                        backgroundColor: isOwnLocation ? 'rgba(0, 122, 255, 0.15)' : 'rgba(0, 122, 255, 0.2)',
                        transform: [{ scale: pulseAnim2 }],
                        opacity: opacityAnim2,
                        top: 0,
                        left: 0,
                    },
                ]}
            />

            {/* Inner pulsating ring */}
            <Animated.View
                style={[
                    styles.pulseRing,
                    {
                        width: pulseSize1,
                        height: pulseSize1,
                        borderRadius: pulseSize1 / 2,
                        backgroundColor: isOwnLocation ? 'rgba(0, 122, 255, 0.2)' : 'rgba(0, 122, 255, 0.3)',
                        transform: [{ scale: pulseAnim1 }],
                        opacity: opacityAnim1,
                        top: (containerSize - pulseSize1) / 2,
                        left: (containerSize - pulseSize1) / 2,
                    },
                ]}
            />

            {/* Direction arrow for own location */}
            {isOwnLocation && (
                <View
                    style={[
                        styles.directionArrow,
                        {
                            top: -2,
                            left: (containerSize - 12) / 2,
                        },
                    ]}
                />
            )}

            {/* Main location marker */}
            <View
                style={[
                    styles.mainMarker,
                    {
                        width: markerSize,
                        height: markerSize,
                        borderRadius: markerSize / 2,
                        borderWidth: isOwnLocation ? 4 : 3,
                        top: (containerSize - markerSize) / 2,
                        left: (containerSize - markerSize) / 2,
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
    directionArrow: {
        position: 'absolute',
        width: 0,
        height: 0,
        borderLeftWidth: 6,
        borderRightWidth: 6,
        borderBottomWidth: 12,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderBottomColor: '#FFFFFF',
        zIndex: 2,
    },
    mainMarker: {
        position: 'absolute',
        backgroundColor: '#007AFF',
        borderColor: '#FFFFFF',
        shadowColor: '#007AFF',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 4,
        elevation: 8,
        zIndex: 3,
    },
});