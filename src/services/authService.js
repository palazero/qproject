import { api } from 'src/boot/axios'

export class AuthService {
  constructor() {
    this.token = localStorage.getItem('auth_token')
    this.user = this.loadUserFromStorage()
  }

  // Load user data from localStorage
  loadUserFromStorage() {
    const userData = localStorage.getItem('user_data')
    return userData ? JSON.parse(userData) : null
  }

  // Save user data to localStorage
  saveUserToStorage(user) {
    localStorage.setItem('user_data', JSON.stringify(user))
    this.user = user
  }

  // Clear user data from localStorage
  clearUserFromStorage() {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('user_data')
    this.token = null
    this.user = null
  }

  // Check if user is authenticated
  isAuthenticated() {
    return !!this.token && !!this.user
  }

  // Get current user
  getCurrentUser() {
    return this.user
  }

  // Get auth token
  getToken() {
    return this.token
  }

  // Login user
  async login(credentials) {
    try {
      const response = await api.post('/auth/login', credentials)
      const { token, user } = response.data

      this.token = token
      localStorage.setItem('auth_token', token)
      this.saveUserToStorage(user)

      return { success: true, user, token }
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Login failed'
      }
    }
  }

  // Register user
  async register(userData) {
    try {
      const response = await api.post('/auth/register', userData)
      const { token, user } = response.data

      this.token = token
      localStorage.setItem('auth_token', token)
      this.saveUserToStorage(user)

      return { success: true, user, token }
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Registration failed'
      }
    }
  }

  // Logout user
  async logout() {
    try {
      // Optionally call logout endpoint
      if (this.token) {
        await api.post('/auth/logout')
      }
    } catch (error) {
      console.warn('Logout API call failed:', error)
    } finally {
      this.clearUserFromStorage()
    }
  }

  // Refresh token
  async refreshToken() {
    try {
      const response = await api.post('/auth/refresh')
      const { token } = response.data

      this.token = token
      localStorage.setItem('auth_token', token)

      return { success: true, token }
    } catch (error) {
      this.clearUserFromStorage()
      return { success: false }
    }
  }

  // Verify token validity
  async verifyToken() {
    if (!this.token) return false

    try {
      const response = await api.get('/auth/verify')
      return response.data.valid
    } catch (error) {
      this.clearUserFromStorage()
      return false
    }
  }
}

// Create singleton instance
export const authService = new AuthService()