import { create } from 'zustand'

interface Project {
  id: string
  name: string
  description?: string
}

interface ProjectStore {
  projects: Project[]
  activeProjectId: string
  setProjects: (projects: Project[]) => void
  setActiveProjectId: (id: string) => void
}

const DEFAULT_PROJECT_ID = '00000000-0000-0000-0000-000000000001'

export const useProjectStore = create<ProjectStore>((set) => ({
  projects: [],
  activeProjectId: localStorage.getItem('active-project-id') ?? DEFAULT_PROJECT_ID,
  setProjects: (projects) => set({ projects }),
  setActiveProjectId: (id) => {
    localStorage.setItem('active-project-id', id)
    set({ activeProjectId: id })
  },
}))

export { DEFAULT_PROJECT_ID }