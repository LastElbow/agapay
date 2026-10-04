import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';

type Props = { children: React.ReactNode };
type State = { hasError: boolean; error?: Error; info?: any };

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('[ErrorBoundary] caught error:', error, info);
    this.setState({ hasError: true, error, info });
  }

  handleRetry = () => {
    // Reset error state to re-render children
    this.setState({ hasError: false, error: undefined, info: undefined });
  };

  handleReload = () => {
    if (Platform.OS === 'web') {
      window.location.reload();
    } else if (global && (global as any).Expo) {
      try {
        (global as any).Expo.reload();
      } catch (e) {
        // Fallback: just reset state
        this.handleRetry();
      }
    } else {
      this.handleRetry();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>⚠️</Text>
          </View>
          <Text style={styles.title}>Oops! Something went wrong.</Text>
          <Text style={styles.subtitle}>
            We encountered an unexpected error. Please try again.
          </Text>

          {__DEV__ && (
            <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.errorLabel}>Error Details (Dev Only):</Text>
              <Text style={styles.message}>{String(this.state.error)}</Text>
              <Text style={styles.stack}>{String(this.state.info?.componentStack)}</Text>
            </ScrollView>
          )}

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={this.handleRetry}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryButtonText}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={this.handleReload}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>Reload App</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return this.props.children as any;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#e6f5f0', // Greenish theme
  },
  iconContainer: {
    marginBottom: 16,
  },
  icon: {
    fontSize: 64,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a2e',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#555',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  scroll: {
    maxHeight: 200,
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 24,
  },
  errorLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B91C1C',
    marginBottom: 8,
  },
  message: {
    fontSize: 13,
    color: '#333',
    marginBottom: 8,
  },
  stack: {
    fontSize: 11,
    color: '#666',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#089769',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#f1f1f1',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  secondaryButtonText: {
    color: '#333',
    fontSize: 15,
    fontWeight: '600',
  },
});

