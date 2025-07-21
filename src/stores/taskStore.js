import { defineStore } from 'pinia'
import { v4 as uuidv4 } from 'uuid'

const STORAGE_KEY = 'task-manager-data'

// Helper function to format date for Gantt without timezone issues
const formatDateForGantt = (date) => {
  if (!date) return null
  const d = new Date(date)
  // 使用本地時間格式化，避免UTC轉換
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// LocalStorage persistence plugin
const persistencePlugin = (store) => {
  let debounceTimer = null
  
  // Load initial data from localStorage
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    try {
      const data = JSON.parse(stored)
      store.$patch(data)
    } catch (e) {
      console.warn('Failed to load stored data:', e)
    }
  }
  
  // Save to localStorage with debounce
  store.$subscribe((mutation, state) => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      const dataToStore = {
        tasks: state.tasks,
        links: state.links,
        tags: state.tags,
        lastUpdated: Date.now()
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToStore))
    }, 500)
  })
}

export const useTaskStore = defineStore('task', {
  state: () => ({
    tasks: [],
    links: [],
    tags: ['UI', 'Backend', 'Testing', 'Documentation'],
    lastUpdated: null,
    currentView: 'list', // 'list' or 'gantt'
    showCreateTaskDialog: false, // For triggering create dialog from sidebar
    expandedTasks: [], // Global expanded tasks state (using array for reactivity)
    filters: {
      status: null,
      priority: null,
      tags: [],
      assignee: null,
      dateRange: null
    }
  }),

  getters: {
    // Get tasks in tree structure
    taskTree: (state) => {
      const buildTree = (parentId = null) => {
        return state.tasks
          .filter(task => task.parentId === parentId)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(task => ({
            ...task,
            children: buildTree(task.id)
          }))
      }
      return buildTree()
    },

    // Get filtered tasks
    filteredTasks: (state) => {
      let filtered = [...state.tasks]
      
      if (state.filters.status) {
        filtered = filtered.filter(task => task.status === state.filters.status)
      }
      
      if (state.filters.priority) {
        filtered = filtered.filter(task => task.priority === state.filters.priority)
      }
      
      if (state.filters.tags.length > 0) {
        filtered = filtered.filter(task => 
          task.tags.some(tag => state.filters.tags.includes(tag))
        )
      }
      
      if (state.filters.assignee) {
        filtered = filtered.filter(task => task.assignee === state.filters.assignee)
      }
      
      return filtered
    },

    // Convert tasks to Gantt format
    ganttData: (state) => {
      const data = state.tasks.map(task => {
        // 計算日期
        let startDate = task.startTime ? new Date(task.startTime) : new Date()
        let duration = 1
        
        if (task.startTime && task.endTime) {
          const start = new Date(task.startTime)
          const end = new Date(task.endTime)
          duration = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)))
        }
        
        // 確保日期格式正確，避免時區偏移問題
        const formattedStartDate = formatDateForGantt(startDate)
        
        return {
          id: task.id,
          text: task.title || '未命名任務',
          start_date: formattedStartDate,
          duration: duration,
          parent: task.parentId || 0,
          progress: task.status === 'done' ? 1 : (task.status === 'in_progress' ? 0.5 : 0),
          type: 'task',
          // 添加額外資訊
          priority: task.priority,
          status: task.status,
          assignee: task.assignee
        }
      })

      // 暫時禁用 links 以避免渲染錯誤
      const links = []
      
      // const links = state.links
      //   .filter(link => link && link.source && link.target) // 過濾無效的 links
      //   .map((link, index) => ({
      //     id: index + 1,
      //     source: link.source,
      //     target: link.target,
      //     type: link.type || '0' // 0: finish_to_start
      //   }))

      console.log('Generated Gantt data:', { data, links })
      return { data, links }
    },

    // Get task by ID
    getTaskById: (state) => (id) => {
      return state.tasks.find(task => task.id === id)
    },

    // Get task dependencies
    getTaskDependencies: (state) => (taskId) => {
      return state.tasks.filter(task => task.dependencies.includes(taskId))
    },

    // Check if task can be marked as done (all dependencies completed)
    canMarkAsDone: (state) => (taskId) => {
      const task = state.tasks.find(t => t.id === taskId)
      if (!task || !task.dependencies.length) return true
      
      return task.dependencies.every(depId => {
        const depTask = state.tasks.find(t => t.id === depId)
        return depTask && depTask.status === 'done'
      })
    },

    // Get blocked tasks (tasks that cannot proceed due to dependencies)
    getBlockedTasks: (state) => {
      return state.tasks.filter(task => {
        if (task.status === 'done' || !task.dependencies.length) return false
        
        return task.dependencies.some(depId => {
          const depTask = state.tasks.find(t => t.id === depId)
          return !depTask || depTask.status !== 'done'
        })
      })
    },

    // Get dependency chain for a task
    getDependencyChain: (state) => (taskId) => {
      const visited = new Set()
      const chain = []
      
      const buildChain = (id) => {
        if (visited.has(id)) return // Prevent circular dependencies
        visited.add(id)
        
        const task = state.tasks.find(t => t.id === id)
        if (!task) return
        
        task.dependencies.forEach(depId => {
          const depTask = state.tasks.find(t => t.id === depId)
          if (depTask) {
            chain.push(depTask)
            buildChain(depId)
          }
        })
      }
      
      buildChain(taskId)
      return chain
    },

    // Check for circular dependencies
    hasCircularDependency: (state) => (taskId, newDependencies) => {
      const checkCircular = (id, visited = new Set()) => {
        if (visited.has(id)) return true
        if (id === taskId) return true
        
        visited.add(id)
        
        const task = state.tasks.find(t => t.id === id)
        if (!task) return false
        
        return task.dependencies.some(depId => checkCircular(depId, new Set(visited)))
      }
      
      return newDependencies.some(depId => checkCircular(depId))
    }
  },

  actions: {
    // Create new task
    createTask(taskData) {
      const newTask = {
        id: uuidv4(),
        parentId: taskData.parentId || null,
        title: taskData.title || 'New Task',
        description: taskData.description || '',
        startTime: taskData.startTime || null,
        endTime: taskData.endTime || null,
        assignee: taskData.assignee || '',
        status: taskData.status || 'todo',
        priority: taskData.priority || 'medium',
        tags: taskData.tags || [],
        dependencies: taskData.dependencies || [],
        sortOrder: taskData.sortOrder || this.getNextSortOrder(taskData.parentId),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      
      this.tasks.push(newTask)
      this.updateTaskLinks()
      return newTask
    },

    // Update existing task
    updateTask(taskId, updates) {
      const index = this.tasks.findIndex(task => task.id === taskId)
      if (index !== -1) {
        // Validate dependencies if they are being updated
        if (updates.dependencies) {
          if (this.hasCircularDependency(taskId, updates.dependencies)) {
            throw new Error('無法建立循環依賴關係')
          }
        }
        
        // Validate status change
        if (updates.status === 'done' && !this.canMarkAsDone(taskId)) {
          throw new Error('無法標記為完成：仍有未完成的依賴任務')
        }
        
        this.tasks[index] = {
          ...this.tasks[index],
          ...updates,
          updatedAt: new Date().toISOString()
        }
        
        // Auto-block dependent tasks if this task is blocked
        if (updates.status === 'blocked') {
          this.autoBlockDependentTasks(taskId)
        }
        
        this.updateTaskLinks()
      }
    },

    // Delete task and its children
    deleteTask(taskId) {
      const deleteRecursive = (id) => {
        // Delete children first
        const children = this.tasks.filter(task => task.parentId === id)
        children.forEach(child => deleteRecursive(child.id))
        
        // Remove from tasks array
        this.tasks = this.tasks.filter(task => task.id !== id)
        
        // Remove from dependencies of other tasks
        this.tasks.forEach(task => {
          task.dependencies = task.dependencies.filter(depId => depId !== id)
        })
      }
      
      deleteRecursive(taskId)
      this.updateTaskLinks()
    },

    // Update task order after drag and drop
    updateTaskOrder(taskId, newParentId, newIndex) {
      const task = this.tasks.find(t => t.id === taskId)
      if (!task) {
        console.warn('Task not found:', taskId)
        return
      }

      // Prevent moving a task into itself or its descendants
      if (newParentId === taskId) {
        console.warn('Cannot move task into itself')
        return
      }
      
      if (newParentId && this.isDescendantOf(newParentId, taskId)) {
        console.warn('Cannot move task into its own descendant')
        return
      }

      
      // Store old parent for cleanup
      const oldParentId = task.parentId
      
      // Update task's parent
      task.parentId = newParentId
      task.updatedAt = new Date().toISOString()
      
      // Reorder siblings in the new parent
      const newSiblings = this.tasks
        .filter(t => t.parentId === newParentId && t.id !== taskId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
      
      // Insert at new position
      newSiblings.splice(newIndex, 0, task)
      
      // Update sort orders for all siblings in new parent
      newSiblings.forEach((sibling, index) => {
        sibling.sortOrder = index + 1
      })
      
      // Reorder siblings in the old parent
      if (oldParentId !== newParentId) {
        const oldSiblings = this.tasks
          .filter(t => t.parentId === oldParentId)
          .sort((a, b) => a.sortOrder - b.sortOrder)
        
        oldSiblings.forEach((sibling, index) => {
          sibling.sortOrder = index + 1
        })
      }
      
      // Update task links to reflect new structure
      this.updateTaskLinks()
      
    },

    // Check if targetId is a descendant of sourceId
    isDescendantOf(targetId, sourceId) {
      if (!targetId || !sourceId || targetId === sourceId) return false
      
      // Walk up the parent chain from targetId to see if we reach sourceId
      let currentId = targetId
      const visited = new Set()
      
      while (currentId) {
        if (visited.has(currentId)) break // Prevent infinite loops
        visited.add(currentId)
        
        const currentTask = this.tasks.find(t => t.id === currentId)
        if (!currentTask) break
        
        currentId = currentTask.parentId
        if (currentId === sourceId) return true
      }
      
      return false
    },

    // Get next sort order for a parent
    getNextSortOrder(parentId) {
      const siblings = this.tasks.filter(task => task.parentId === parentId)
      return siblings.length > 0 ? Math.max(...siblings.map(t => t.sortOrder)) + 1 : 1
    },

    // Update task links based on dependencies
    updateTaskLinks() {
      this.links = []
      this.tasks.forEach(task => {
        task.dependencies.forEach(depId => {
          this.links.push({
            source: depId,
            target: task.id,
            type: '0' // finish_to_start
          })
        })
      })
    },

    // Update filters
    setFilter(filterType, value) {
      this.filters[filterType] = value
    },

    // Clear all filters
    clearFilters() {
      this.filters = {
        status: null,
        priority: null,
        tags: [],
        assignee: null,
        dateRange: null
      }
    },

    // Set current view
    setCurrentView(view) {
      this.currentView = view
    },

    // Trigger create task dialog
    triggerCreateTask() {
      this.showCreateTaskDialog = true
    },

    // Reset create task dialog flag
    resetCreateTaskDialog() {
      this.showCreateTaskDialog = false
    },

    // Global expand/collapse methods
    expandAllTasks() {
      const getAllTaskIds = (tasks) => {
        const ids = []
        const collectIds = (taskList) => {
          taskList.forEach(task => {
            if (task.children && task.children.length > 0) {
              ids.push(task.id) // Only add tasks that have children
              collectIds(task.children)
            }
          })
        }
        collectIds(tasks)
        return ids
      }
      
      // Use taskTree getter to get proper hierarchical structure
      const allTaskIds = getAllTaskIds(this.taskTree)
      this.expandedTasks = [...allTaskIds]
    },

    collapseAllTasks() {
      this.expandedTasks.splice(0, this.expandedTasks.length)
    },

    toggleTaskExpansion(taskId) {
      const index = this.expandedTasks.indexOf(taskId)
      if (index !== -1) {
        this.expandedTasks.splice(index, 1)
      } else {
        this.expandedTasks.push(taskId)
      }
    },

    isTaskExpanded(taskId) {
      return this.expandedTasks.includes(taskId)
    },

    // Expand only direct children of a task
    expandTaskLevel(taskId) {
      const task = this.tasks.find(t => t.id === taskId)
      if (task && task.children && task.children.length > 0) {
        // Add the task itself to expanded state
        if (!this.expandedTasks.includes(taskId)) {
          this.expandedTasks.push(taskId)
        }
        
        // Find tasks that have this task as parent and have children
        const directChildren = this.tasks.filter(t => 
          t.parentId === taskId && 
          this.tasks.some(child => child.parentId === t.id)
        )
        
        directChildren.forEach(child => {
          if (!this.expandedTasks.includes(child.id)) {
            this.expandedTasks.push(child.id)
          }
        })
      }
    },

    // Collapse task and all its descendants
    collapseTaskLevel(taskId) {
      const getAllDescendants = (parentId) => {
        const descendants = []
        const children = this.tasks.filter(t => t.parentId === parentId)
        children.forEach(child => {
          descendants.push(child.id)
          descendants.push(...getAllDescendants(child.id))
        })
        return descendants
      }
      
      // Remove the task and all its descendants from expanded state
      const taskIndex = this.expandedTasks.indexOf(taskId)
      if (taskIndex !== -1) {
        this.expandedTasks.splice(taskIndex, 1)
      }
      
      const descendants = getAllDescendants(taskId)
      descendants.forEach(id => {
        const index = this.expandedTasks.indexOf(id)
        if (index !== -1) {
          this.expandedTasks.splice(index, 1)
        }
      })
    },

    // Duplicate task
    duplicateTask(taskId) {
      const originalTask = this.tasks.find(task => task.id === taskId)
      if (!originalTask) return null
      
      const duplicatedTask = {
        ...originalTask,
        id: uuidv4(),
        title: `${originalTask.title} (副本)`,
        dependencies: [], // Clear dependencies for duplicated task
        sortOrder: this.getNextSortOrder(originalTask.parentId),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      
      this.tasks.push(duplicatedTask)
      this.updateTaskLinks()
      return duplicatedTask
    },

    // Add new tag
    addTag(tag) {
      if (tag && !this.tags.includes(tag)) {
        this.tags.push(tag)
      }
    },

    // Remove tag
    removeTag(tag) {
      this.tags = this.tags.filter(t => t !== tag)
    },

    // Auto-block dependent tasks
    autoBlockDependentTasks(taskId) {
      const dependentTasks = this.tasks.filter(task => 
        task.dependencies.includes(taskId) && task.status !== 'done'
      )
      
      dependentTasks.forEach(task => {
        if (task.status !== 'blocked') {
          task.status = 'blocked'
          task.updatedAt = new Date().toISOString()
        }
      })
    },

    // Validate and fix task dependencies
    validateTaskDependencies() {
      let fixCount = 0
      
      this.tasks.forEach(task => {
        // Remove invalid dependencies (tasks that don't exist)
        const validDependencies = task.dependencies.filter(depId => 
          this.tasks.find(t => t.id === depId)
        )
        
        if (validDependencies.length !== task.dependencies.length) {
          task.dependencies = validDependencies
          fixCount++
        }
        
        // Auto-block tasks with incomplete dependencies
        if (task.status !== 'done' && task.dependencies.length > 0) {
          const hasIncompleteDeps = task.dependencies.some(depId => {
            const depTask = this.tasks.find(t => t.id === depId)
            return depTask && depTask.status !== 'done'
          })
          
          if (hasIncompleteDeps && task.status !== 'blocked') {
            task.status = 'blocked'
            fixCount++
          }
        }
      })
      
      if (fixCount > 0) {
        this.updateTaskLinks()
      }
      
      return fixCount
    },

    // Initialize with sample data
    initializeSampleData() {
      if (this.tasks.length === 0) {
        // Level 0 - Main project phases
        const planningTaskId = uuidv4()
        const designTaskId = uuidv4()
        const developmentTaskId = uuidv4()
        const testingTaskId = uuidv4()
        const deploymentTaskId = uuidv4()
        
        // Level 1 - Sub-phases under Design
        const wireframeTaskId = uuidv4()
        const uiDesignTaskId = uuidv4()
        const prototypeTaskId = uuidv4()
        
        // Level 2 - Detailed tasks under UI Design
        const colorSchemeTaskId = uuidv4()
        const componentsTaskId = uuidv4()
        const responsiveTaskId = uuidv4()
        
        // Level 1 - Sub-phases under Development
        const frontendTaskId = uuidv4()
        const backendTaskId = uuidv4()
        const databaseTaskId = uuidv4()
        
        // Level 2 - Detailed tasks under Frontend
        const authPageTaskId = uuidv4()
        const dashboardTaskId = uuidv4()
        const apiIntegrationTaskId = uuidv4()
        
        // Level 2 - Detailed tasks under Backend
        const authApiTaskId = uuidv4()
        const userApiTaskId = uuidv4()
        const dataApiTaskId = uuidv4()
        
        // Level 3 - Granular tasks under Auth API
        const jwtTaskId = uuidv4()
        const validationTaskId = uuidv4()
        
        const sampleTasks = [
          // Level 0 - Main project phases
          {
            id: planningTaskId,
            parentId: null,
            title: '🎯 專案規劃階段',
            description: '制定專案整體規劃、需求分析和時程安排',
            startTime: '2025-07-18T09:00:00',
            endTime: '2025-07-22T17:00:00',
            assignee: 'project.manager',
            status: 'done',
            priority: 'high',
            tags: ['Planning', 'Management'],
            dependencies: [],
            sortOrder: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          {
            id: designTaskId,
            parentId: null,
            title: '🎨 設計階段',
            description: 'UI/UX 設計、原型製作和視覺規劃',
            startTime: '2025-07-23T09:00:00',
            endTime: '2025-08-05T17:00:00',
            assignee: 'design.lead',
            status: 'in_progress',
            priority: 'high',
            tags: ['Design', 'UI'],
            dependencies: [planningTaskId],
            sortOrder: 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          {
            id: developmentTaskId,
            parentId: null,
            title: '💻 開發階段',
            description: '前端與後端開發實作',
            startTime: '2025-08-01T09:00:00',
            endTime: '2025-08-25T17:00:00',
            assignee: 'dev.lead',
            status: 'todo',
            priority: 'high',
            tags: ['Development'],
            dependencies: [designTaskId],
            sortOrder: 3,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          {
            id: testingTaskId,
            parentId: null,
            title: '🧪 測試階段',
            description: '功能測試、整合測試和使用者測試',
            startTime: '2025-08-20T09:00:00',
            endTime: '2025-09-05T17:00:00',
            assignee: 'qa.lead',
            status: 'todo',
            priority: 'medium',
            tags: ['Testing', 'QA'],
            dependencies: [developmentTaskId],
            sortOrder: 4,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          {
            id: deploymentTaskId,
            parentId: null,
            title: '🚀 部署階段',
            description: '生產環境部署和上線作業',
            startTime: '2025-09-03T09:00:00',
            endTime: '2025-09-10T17:00:00',
            assignee: 'devops.engineer',
            status: 'todo',
            priority: 'high',
            tags: ['Deployment', 'DevOps'],
            dependencies: [testingTaskId],
            sortOrder: 5,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },

          // Level 1 - Design sub-tasks
          {
            id: wireframeTaskId,
            parentId: designTaskId,
            title: '📐 線框圖設計',
            description: '建立頁面架構和功能流程線框圖',
            startTime: '2025-07-23T09:00:00',
            endTime: '2025-07-26T17:00:00',
            assignee: 'ux.designer',
            status: 'done',
            priority: 'high',
            tags: ['Wireframe', 'UX'],
            dependencies: [planningTaskId],
            sortOrder: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          {
            id: uiDesignTaskId,
            parentId: designTaskId,
            title: '🎨 UI 介面設計',
            description: '設計視覺介面和互動元件',
            startTime: '2025-07-27T09:00:00',
            endTime: '2025-08-02T17:00:00',
            assignee: 'ui.designer',
            status: 'in_progress',
            priority: 'high',
            tags: ['UI', 'Visual'],
            dependencies: [wireframeTaskId],
            sortOrder: 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          {
            id: prototypeTaskId,
            parentId: designTaskId,
            title: '🔧 互動原型',
            description: '建立可點擊的互動原型',
            startTime: '2025-08-01T09:00:00',
            endTime: '2025-08-05T17:00:00',
            assignee: 'prototype.designer',
            status: 'todo',
            priority: 'medium',
            tags: ['Prototype', 'Interactive'],
            dependencies: [uiDesignTaskId],
            sortOrder: 3,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },

          // Level 2 - UI Design detailed tasks
          {
            id: colorSchemeTaskId,
            parentId: uiDesignTaskId,
            title: '🎨 色彩配置',
            description: '確定主要色彩和配色方案',
            startTime: '2025-07-27T09:00:00',
            endTime: '2025-07-28T17:00:00',
            assignee: 'ui.designer',
            status: 'done',
            priority: 'medium',
            tags: ['Color', 'Branding'],
            dependencies: [wireframeTaskId],
            sortOrder: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          {
            id: componentsTaskId,
            parentId: uiDesignTaskId,
            title: '🧩 元件設計',
            description: '設計可重複使用的 UI 元件',
            startTime: '2025-07-29T09:00:00',
            endTime: '2025-07-31T17:00:00',
            assignee: 'ui.designer',
            status: 'in_progress',
            priority: 'high',
            tags: ['Components', 'Design System'],
            dependencies: [colorSchemeTaskId],
            sortOrder: 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          {
            id: responsiveTaskId,
            parentId: uiDesignTaskId,
            title: '📱 響應式設計',
            description: '適配不同螢幕尺寸的響應式設計',
            startTime: '2025-08-01T09:00:00',
            endTime: '2025-08-02T17:00:00',
            assignee: 'ui.designer',
            status: 'todo',
            priority: 'medium',
            tags: ['Responsive', 'Mobile'],
            dependencies: [componentsTaskId],
            sortOrder: 3,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },

          // Level 1 - Development sub-tasks
          {
            id: frontendTaskId,
            parentId: developmentTaskId,
            title: '🖥️ 前端開發',
            description: '用戶介面和互動功能開發',
            startTime: '2025-08-01T09:00:00',
            endTime: '2025-08-15T17:00:00',
            assignee: 'frontend.dev',
            status: 'todo',
            priority: 'high',
            tags: ['Frontend', 'React'],
            dependencies: [uiDesignTaskId],
            sortOrder: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          {
            id: backendTaskId,
            parentId: developmentTaskId,
            title: '⚙️ 後端開發',
            description: 'API 服務和業務邏輯開發',
            startTime: '2025-08-03T09:00:00',
            endTime: '2025-08-20T17:00:00',
            assignee: 'backend.dev',
            status: 'todo',
            priority: 'high',
            tags: ['Backend', 'API'],
            dependencies: [planningTaskId],
            sortOrder: 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          {
            id: databaseTaskId,
            parentId: developmentTaskId,
            title: '🗄️ 資料庫設計',
            description: '資料庫結構設計和最佳化',
            startTime: '2025-08-01T09:00:00',
            endTime: '2025-08-08T17:00:00',
            assignee: 'db.architect',
            status: 'todo',
            priority: 'high',
            tags: ['Database', 'Schema'],
            dependencies: [planningTaskId],
            sortOrder: 3,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },

          // Level 2 - Frontend detailed tasks
          {
            id: authPageTaskId,
            parentId: frontendTaskId,
            title: '🔐 登入註冊頁面',
            description: '實作使用者登入和註冊功能',
            startTime: '2025-08-01T09:00:00',
            endTime: '2025-08-05T17:00:00',
            assignee: 'frontend.dev',
            status: 'todo',
            priority: 'high',
            tags: ['Auth', 'Forms'],
            dependencies: [componentsTaskId],
            sortOrder: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          {
            id: dashboardTaskId,
            parentId: frontendTaskId,
            title: '📊 主控台介面',
            description: '建立使用者主控台和儀表板',
            startTime: '2025-08-06T09:00:00',
            endTime: '2025-08-12T17:00:00',
            assignee: 'frontend.dev',
            status: 'todo',
            priority: 'medium',
            tags: ['Dashboard', 'Charts'],
            dependencies: [authPageTaskId],
            sortOrder: 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          {
            id: apiIntegrationTaskId,
            parentId: frontendTaskId,
            title: '🔗 API 整合',
            description: '整合前端與後端 API 服務',
            startTime: '2025-08-10T09:00:00',
            endTime: '2025-08-15T17:00:00',
            assignee: 'frontend.dev',
            status: 'todo',
            priority: 'high',
            tags: ['Integration', 'API'],
            dependencies: [backendTaskId],
            sortOrder: 3,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },

          // Level 2 - Backend detailed tasks
          {
            id: authApiTaskId,
            parentId: backendTaskId,
            title: '🔑 認證 API',
            description: '實作使用者認證和授權 API',
            startTime: '2025-08-03T09:00:00',
            endTime: '2025-08-08T17:00:00',
            assignee: 'backend.dev',
            status: 'todo',
            priority: 'high',
            tags: ['Auth', 'Security'],
            dependencies: [databaseTaskId],
            sortOrder: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          {
            id: userApiTaskId,
            parentId: backendTaskId,
            title: '👤 使用者管理 API',
            description: '實作使用者資料管理相關 API',
            startTime: '2025-08-09T09:00:00',
            endTime: '2025-08-15T17:00:00',
            assignee: 'backend.dev',
            status: 'todo',
            priority: 'medium',
            tags: ['User', 'CRUD'],
            dependencies: [authApiTaskId],
            sortOrder: 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          {
            id: dataApiTaskId,
            parentId: backendTaskId,
            title: '📈 資料處理 API',
            description: '實作業務資料處理和分析 API',
            startTime: '2025-08-12T09:00:00',
            endTime: '2025-08-20T17:00:00',
            assignee: 'backend.dev',
            status: 'todo',
            priority: 'medium',
            tags: ['Data', 'Analytics'],
            dependencies: [userApiTaskId],
            sortOrder: 3,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },

          // Level 3 - Auth API granular tasks
          {
            id: jwtTaskId,
            parentId: authApiTaskId,
            title: '🎫 JWT 令牌管理',
            description: '實作 JWT 令牌生成、驗證和刷新機制',
            startTime: '2025-08-03T09:00:00',
            endTime: '2025-08-05T17:00:00',
            assignee: 'backend.dev',
            status: 'todo',
            priority: 'high',
            tags: ['JWT', 'Token'],
            dependencies: [databaseTaskId],
            sortOrder: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          {
            id: validationTaskId,
            parentId: authApiTaskId,
            title: '✅ 輸入驗證',
            description: '實作 API 輸入驗證和錯誤處理',
            startTime: '2025-08-06T09:00:00',
            endTime: '2025-08-08T17:00:00',
            assignee: 'backend.dev',
            status: 'todo',
            priority: 'medium',
            tags: ['Validation', 'Security'],
            dependencies: [jwtTaskId],
            sortOrder: 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ]
        
        this.tasks = sampleTasks
        this.updateTaskLinks()
      }
    },

    // Reset and reload sample data (for testing)
    resetSampleData() {
      this.tasks = []
      this.links = []
      this.lastUpdated = null
      // Clear localStorage
      localStorage.removeItem(STORAGE_KEY)
      // Reload sample data
      this.initializeSampleData()
    }
  },

  // Install persistence plugin
  plugins: [persistencePlugin]
})