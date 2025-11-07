import React, { ReactNode, createContext, useContext, useState } from 'react'
import { RepositoryPermissions } from '../services/collaboration-service.ts'

export interface Repository {
  did: string
  handle: string
  accessType: 'owner' | 'shared' | 'none'
  permissions?: RepositoryPermissions
  collaboratorCount?: number
  isOwner?: boolean // Helper to quickly check if current user is owner
  createdAt?: string
  description?: string
}

interface RepositoryContextType {
  repositories: Repository[]
  setRepositories: React.Dispatch<React.SetStateAction<Repository[]>>
  selectedRepo: string
  setSelectedRepo: React.Dispatch<React.SetStateAction<string>>
  addRepository: (repo: Repository) => void
  updateRepository: (did: string, updates: Partial<Repository>) => void
  removeRepository: (did: string) => void
  updateCollaborators: (did: string, collaboratorCount: number) => void
  refreshRepository: (did: string) => void
}

const RepositoryContext = createContext<RepositoryContextType | undefined>(
  undefined,
)

export function useRepositoryContext() {
  const context = useContext(RepositoryContext)
  if (context === undefined) {
    throw new Error(
      'useRepositoryContext must be used within a RepositoryProvider',
    )
  }
  return context
}

interface RepositoryProviderProps {
  children: ReactNode
}

export function RepositoryProvider({ children }: RepositoryProviderProps) {
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [selectedRepo, setSelectedRepo] = useState<string>('')

  const addRepository = (repo: Repository) => {
    setRepositories((prev) => [...prev, repo])
  }

  const updateRepository = (did: string, updates: Partial<Repository>) => {
    setRepositories((prev) =>
      prev.map((repo) => (repo.did === did ? { ...repo, ...updates } : repo)),
    )
  }

  const removeRepository = (did: string) => {
    setRepositories((prev) => prev.filter((repo) => repo.did !== did))
    if (selectedRepo === did) {
      setSelectedRepo('')
    }
  }

  const updateCollaborators = (did: string, collaboratorCount: number) => {
    setRepositories((prev) =>
      prev.map((repo) =>
        repo.did === did ? { ...repo, collaboratorCount } : repo,
      ),
    )
  }

  const refreshRepository = (did: string) => {
    // This method can be used to trigger a refresh of repository data
    // For now, it's a placeholder that could be extended to call APIs
    console.log(`Refreshing repository data for ${did}`)
  }

  return (
    <RepositoryContext.Provider
      value={{
        repositories,
        setRepositories,
        selectedRepo,
        setSelectedRepo,
        addRepository,
        updateRepository,
        removeRepository,
        updateCollaborators,
        refreshRepository,
      }}
    >
      {children}
    </RepositoryContext.Provider>
  )
}
