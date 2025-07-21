import { defineStore } from 'pinia'
import { authService } from 'src/services/authService'
import { useTaskStore } from './taskStore'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: authService.getCurrentUser(),
    token: authService.getToken(),
    isAuthenticated: authService.isAuthenticated(),
    isLoading: false,
    error: null
  }),

  getters: {
    userDisplayName: (state) => {
      return state.user?.username || state.user?.email || 'Unknown User'
    },
    userId: (state) => {
      return state.user?.id
    }
  },

  actions: {
    // Initialize auth state
    async initialize() {
      if (this.token) {
        const isValid = await authService.verifyToken()
        if (!isValid) {
          this.logout()
        } else {
          // Initialize task store with backend connection
          const taskStore = useTaskStore()
          await taskStore.initializeBackend(this.user?.defaultProjectId, this.token)
        }
      }
    },

    // Login action
    async login(credentials) {
      this.isLoading = true
      this.error = null

      try {
        const result = await authService.login(credentials)
        
        if (result.success) {
          this.user = result.user
          this.token = result.token
          this.isAuthenticated = true

          // Initialize task store with backend connection
          const taskStore = useTaskStore()
          await taskStore.initializeBackend(result.user.defaultProjectId, result.token)

          return { success: true }
        } else {
          this.error = result.error
          return { success: false, error: result.error }
        }
      } catch (error) {
        this.error = 'Login failed'
        return { success: false, error: 'Login failed' }
      } finally {
        this.isLoading = false
      }
    },

    // Register action
    async register(userData) {
      this.isLoading = true
      this.error = null

      try {
        const result = await authService.register(userData)
        
        if (result.success) {
          this.user = result.user
          this.token = result.token
          this.isAuthenticated = true

          // Initialize task store with backend connection
          const taskStore = useTaskStore()
          await taskStore.initializeBackend(result.user.defaultProjectId, result.token)

          return { success: true }
        } else {
          this.error = result.error
          return { success: false, error: result.error }
        }
      } catch (error) {
        this.error = 'Registration failed'
        return { success: false, error: 'Registration failed' }
      } finally {
        this.isLoading = false
      }
    },

    // Logout action
    async logout() {
      this.isLoading = true

      try {
        await authService.logout()
      } catch (error) {
        console.warn('Logout failed:', error)
      } finally {
        this.user = null
        this.token = null
        this.isAuthenticated = false
        this.isLoading = false
        this.error = null

        // Disconnect socket and clear task store
        const taskStore = useTaskStore()
        if (taskStore.socket) {
          taskStore.socket.disconnect()
          taskStore.socket = null
        }
        taskStore.currentUser = null
        taskStore.authToken = null
      }
    },

    // Clear error
    clearError() {
      this.error = null
    },

    // Set current user (useful for profile updates)
    setUser(user) {
      this.user = user
      authService.saveUserToStorage(user)
    }
  }
})