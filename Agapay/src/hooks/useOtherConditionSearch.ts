import { useState, useEffect, useCallback, useRef } from 'react';
import apiClient from '@/api/client';

/**
 * Custom hook for searching verified other conditions with debouncing
 * @param query - The search query string
 * @param debounceMs - Debounce delay in milliseconds (default: 300)
 * @returns Object containing suggestions array and loading state
 */
export function useOtherConditionSearch(query: string, debounceMs = 300) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchSuggestions = useCallback(async (searchTerm: string) => {
    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Don't search for empty or very short queries
    if (!searchTerm || searchTerm.trim().length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      setLoading(true);
      setError(null);

      const response = await apiClient.get<string[]>('/api/conditions/search', {
        params: { q: searchTerm.trim() },
        signal: controller.signal,
      });

      setSuggestions(response.data || []);
    } catch (err: any) {
      // Ignore abort errors (expected when canceling previous requests)
      if (err.name === 'AbortError' || err.name === 'CanceledError') {
        return;
      }
      
      console.error('Failed to fetch condition suggestions:', err);
      setError(err.message || 'Failed to fetch suggestions');
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Debounce the search
    const timeoutId = setTimeout(() => {
      fetchSuggestions(query);
    }, debounceMs);

    return () => {
      clearTimeout(timeoutId);
      // Cancel pending request on unmount or query change
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [query, debounceMs, fetchSuggestions]);

  return { suggestions, loading, error };
}
