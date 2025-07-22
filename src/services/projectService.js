import { api } from 'boot/axios'

export const projectService = {
  async getAllProjects() {
    const response = await api.get('/projects/')
    return response.data
  },

  async createProject(projectData) {
    const response = await api.post('/projects/', projectData)
    return response.data
  },

  async getProject(projectId) {
    const response = await api.get(`/projects/${projectId}`)
    return response.data
  },

  async updateProject(projectId, projectData) {
    const response = await api.put(`/projects/${projectId}`, projectData)
    return response.data
  },

  async deleteProject(projectId) {
    const response = await api.delete(`/projects/${projectId}`)
    return response.data
  },

  async getProjectMembers(projectId) {
    const response = await api.get(`/projects/${projectId}/members`)
    return response.data
  },

  async addProjectMember(projectId, memberData) {
    const response = await api.post(`/projects/${projectId}/members`, memberData)
    return response.data
  },

  async removeProjectMember(projectId, userId) {
    const response = await api.delete(`/projects/${projectId}/members/${userId}`)
    return response.data
  }
}