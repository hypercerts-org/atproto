import React, { ReactNode, createContext, useContext, useState } from 'react'

export interface Repository {
  did: string
  handle: string
  accessType: 'owner' | 'shared' | 'none'
  permissions?: { read: boolean; write: boolean }
  collaboratorCount?: number
}

interface RepositoryContextType {
  repositories: Repository[]
  setRepositories: React.Dispatch<React.SetStateAction<Repository[]>>
  selectedRepo: string
  setSelectedRepo: React.Dispatch<React.SetStateAction<string>>
  addRepository: (repo: Repository) => void
  updateRepository: (did: string, updates: Partial<Repository>) => void
  removeRepository: (did: string) => void
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
      }}
    >
      {children}
    </RepositoryContext.Provider>
  )
}
