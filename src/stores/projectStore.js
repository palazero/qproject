import { defineStore } from 'pinia'
import { projectService } from 'src/services/projectService'
import { Notify } from 'quasar'
import { v4 as uuidv4 } from 'uuid'

const PROJECT_STORAGE_KEY = 'project-manager-data'

const persistencePlugin = (store) => {
  let debounceTimer = null

  const stored = localStorage.getItem(PROJECT_STORAGE_KEY)
  if (stored) {
    try {
      const data = JSON.parse(stored)
      store.$patch(data)
    } catch (e) {
      console.warn('Failed to load stored project data:', e)
    }
  }

  store.$subscribe((mutation, state) => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      const dataToStore = {
        projects: state.projects,
        currentProject: state.currentProject,
        projectMembers: state.projectMembers,
        userRole: state.userRole,
        lastUpdated: Date.now(),
      }
      localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(dataToStore))
    }, 500)
  })
}

export const useProjectStore = defineStore('project', {
  state: () => ({
    projects: [],
    currentProject: null,
    projectMembers: {},
    userRole: {},
    isOnline: navigator.onLine,
    syncStatus: 'idle',
    pendingProjectActions: [],
    pendingMemberActions: [],
    lastUpdated: null,
  }),

  getters: {
    currentProjectId: (state) => state.currentProject?.id || null,
    
    currentUserRole: (state) => {
      if (!state.currentProject) return null
      return state.userRole[state.currentProject.id] || 'member'
    },

    canManageProject: (state) => {
      const role = state.userRole[state.currentProject?.id]
      return role === 'owner' || role === 'admin'
    },

    canDeleteProject: (state) => {
      const role = state.userRole[state.currentProject?.id]
      return role === 'owner'
    },

    getCurrentProjectMembers: (state) => {
      if (!state.currentProject) return []
      return state.projectMembers[state.currentProject.id] || []
    }
  },

  actions: {
    async loadProjects() {
      if (!this.isOnline) {
        Notify.create({
          type: 'warning',
          message: '目前離線模式，顯示快取專案',
          position: 'top'
        })
        return
      }

      try {
        this.syncStatus = 'syncing'
        const data = await projectService.getAllProjects()
        this.projects = data.projects || []
        
        if (data.projects?.length > 0 && !this.currentProject) {
          this.currentProject = data.projects[0]
        }

        this.syncStatus = 'idle'
        this.lastUpdated = Date.now()
      } catch (error) {
        this.syncStatus = 'error'
        console.error('Failed to load projects:', error)
        Notify.create({
          type: 'negative',
          message: `載入專案失敗: ${error.message}`,
          position: 'top'
        })
      }
    },

    async createProject(projectData) {
      // Generate project ID locally
      const projectId = uuidv4()
      const projectWithId = {
        ...projectData,
        id: projectId,
        status: projectData.status || 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      if (!this.isOnline) {
        // Store project locally for offline mode
        this.projects.push(projectWithId)
        this.userRole[projectId] = 'owner'
        
        if (!this.currentProject) {
          this.currentProject = projectWithId
        }

        this.pendingProjectActions.push({
          type: 'create',
          data: projectWithId,
          timestamp: Date.now()
        })
        
        Notify.create({
          type: 'info',
          message: '離線模式：專案建立將在連線後同步',
          position: 'top'
        })
        
        return projectWithId
      }

      try {
        const newProject = await projectService.createProject(projectWithId)
        // Use returned project data if server modifies it, otherwise use local data
        const finalProject = newProject.id ? newProject : projectWithId
        
        this.projects.push(finalProject)
        this.userRole[finalProject.id] = 'owner'
        
        if (!this.currentProject) {
          this.currentProject = finalProject
        }

        Notify.create({
          type: 'positive',
          message: '專案建立成功',
          position: 'top'
        })
        
        return finalProject
      } catch (error) {
        console.error('Failed to create project:', error)
        Notify.create({
          type: 'negative',
          message: `建立專案失敗: ${error.message}`,
          position: 'top'
        })
        throw error
      }
    },

    async updateProject(projectId, projectData) {
      if (!this.canManageProject) {
        Notify.create({
          type: 'warning',
          message: '沒有權限修改此專案',
          position: 'top'
        })
        return
      }

      if (!this.isOnline) {
        this.pendingProjectActions.push({
          type: 'update',
          projectId,
          data: projectData,
          timestamp: Date.now()
        })
        
        const projectIndex = this.projects.findIndex(p => p.id === projectId)
        if (projectIndex !== -1) {
          this.projects[projectIndex] = { ...this.projects[projectIndex], ...projectData }
          if (this.currentProject?.id === projectId) {
            this.currentProject = this.projects[projectIndex]
          }
        }
        return
      }

      try {
        const updatedProject = await projectService.updateProject(projectId, projectData)
        const projectIndex = this.projects.findIndex(p => p.id === projectId)
        
        if (projectIndex !== -1) {
          this.projects[projectIndex] = updatedProject
          if (this.currentProject?.id === projectId) {
            this.currentProject = updatedProject
          }
        }

        Notify.create({
          type: 'positive',
          message: '專案更新成功',
          position: 'top'
        })
      } catch (error) {
        console.error('Failed to update project:', error)
        Notify.create({
          type: 'negative',
          message: `更新專案失敗: ${error.message}`,
          position: 'top'
        })
        throw error
      }
    },

    async deleteProject(projectId) {
      if (!this.canDeleteProject) {
        Notify.create({
          type: 'warning',
          message: '只有專案擁有者可以刪除專案',
          position: 'top'
        })
        return
      }

      if (!this.isOnline) {
        Notify.create({
          type: 'warning',
          message: '離線模式無法刪除專案',
          position: 'top'
        })
        return
      }

      try {
        await projectService.deleteProject(projectId)
        this.projects = this.projects.filter(p => p.id !== projectId)
        
        if (this.currentProject?.id === projectId) {
          this.currentProject = this.projects.length > 0 ? this.projects[0] : null
        }

        delete this.projectMembers[projectId]
        delete this.userRole[projectId]

        Notify.create({
          type: 'positive',
          message: '專案刪除成功',
          position: 'top'
        })
      } catch (error) {
        console.error('Failed to delete project:', error)
        Notify.create({
          type: 'negative',
          message: `刪除專案失敗: ${error.message}`,
          position: 'top'
        })
        throw error
      }
    },

    setCurrentProject(project) {
      this.currentProject = project
      if (project && !this.projectMembers[project.id]) {
        this.loadProjectMembers(project.id)
      }
    },

    async loadProjectMembers(projectId) {
      if (!this.isOnline) return

      try {
        const members = await projectService.getProjectMembers(projectId)
        this.projectMembers[projectId] = members
      } catch (error) {
        console.error('Failed to load project members:', error)
      }
    },

    async addProjectMember(projectId, memberData) {
      if (!this.canManageProject) {
        Notify.create({
          type: 'warning',
          message: '沒有權限管理專案成員',
          position: 'top'
        })
        return
      }

      if (!this.isOnline) {
        this.pendingMemberActions.push({
          type: 'add',
          projectId,
          data: memberData,
          timestamp: Date.now()
        })
        return
      }

      try {
        await projectService.addProjectMember(projectId, memberData)
        await this.loadProjectMembers(projectId)
        
        Notify.create({
          type: 'positive',
          message: '成員新增成功',
          position: 'top'
        })
      } catch (error) {
        console.error('Failed to add project member:', error)
        Notify.create({
          type: 'negative',
          message: `新增成員失敗: ${error.message}`,
          position: 'top'
        })
        throw error
      }
    },

    async removeProjectMember(projectId, userId) {
      if (!this.canManageProject) {
        Notify.create({
          type: 'warning',
          message: '沒有權限管理專案成員',
          position: 'top'
        })
        return
      }

      if (!this.isOnline) {
        this.pendingMemberActions.push({
          type: 'remove',
          projectId,
          userId,
          timestamp: Date.now()
        })
        return
      }

      try {
        await projectService.removeProjectMember(projectId, userId)
        await this.loadProjectMembers(projectId)
        
        Notify.create({
          type: 'positive',
          message: '成員移除成功',
          position: 'top'
        })
      } catch (error) {
        console.error('Failed to remove project member:', error)
        Notify.create({
          type: 'negative',
          message: `移除成員失敗: ${error.message}`,
          position: 'top'
        })
        throw error
      }
    },

    async syncPendingActions() {
      if (!this.isOnline || (this.pendingProjectActions.length === 0 && this.pendingMemberActions.length === 0)) {
        return
      }

      this.syncStatus = 'syncing'

      try {
        for (const action of this.pendingProjectActions) {
          switch (action.type) {
            case 'create':
              await this.createProject(action.data)
              break
            case 'update':
              await this.updateProject(action.projectId, action.data)
              break
          }
        }

        for (const action of this.pendingMemberActions) {
          switch (action.type) {
            case 'add':
              await this.addProjectMember(action.projectId, action.data)
              break
            case 'remove':
              await this.removeProjectMember(action.projectId, action.userId)
              break
          }
        }

        this.pendingProjectActions = []
        this.pendingMemberActions = []
        this.syncStatus = 'idle'

        Notify.create({
          type: 'positive',
          message: '離線變更已同步',
          position: 'top'
        })
      } catch (error) {
        this.syncStatus = 'error'
        console.error('Failed to sync pending actions:', error)
      }
    },

    updateOnlineStatus(status) {
      const wasOffline = !this.isOnline
      this.isOnline = status
      
      if (status && wasOffline) {
        this.syncPendingActions()
      }
    }
  },

  plugins: [persistencePlugin]
})