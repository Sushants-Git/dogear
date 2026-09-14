import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api.js'

export const keys = {
  stats: ['stats'],
  search: (query, sort) => ['search', query, sort],
}

export function useStats() {
  return useQuery({ queryKey: keys.stats, queryFn: api.stats, staleTime: Infinity })
}

/**
 * `placeholderData` keeps the previous result on screen while the next one is in
 * flight. Without it every keystroke empties the list and the whole pane flickers.
 */
export function useSearch(query, sort) {
  return useQuery({
    queryKey: keys.search(query, sort),
    queryFn: () => api.search({ query, sort }),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  })
}

function useLibraryMutation(mutationFn) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.stats })
      qc.invalidateQueries({ queryKey: ['search'] })
    },
  })
}

export const useImport = () => useLibraryMutation(api.importDialog)
export const useImportPath = () => useLibraryMutation(api.importPath)
export const useRemove = () => useLibraryMutation(api.remove)
export const useClear = () => useLibraryMutation(api.clear)
