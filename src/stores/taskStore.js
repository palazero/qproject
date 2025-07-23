import { defineStore } from 'pinia'
import { v4 as uuidv4 } from 'uuid'
import { api } from 'src/boot/axios'
import { io } from 'socket.io-client'
import { Notify } from 'quasar'

const STORAGE_KEY = 'task_data'

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
      // Ensure currentProjectId is loaded
      store.$patch({
        ...data,
        currentProjectId: data.currentProjectId || null,
      })
    } catch (e) {
      console.warn('Failed to load stored data:', e)
      // Don't use Notify in plugin initialization to avoid slot warnings
      // The error will be logged to console for debugging
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
        lastUpdated: Date.now(),
        currentProjectId: state.currentProjectId,
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
      dateRange: null,
    },

    // Backend integration state
    isOnline: navigator.onLine,
    syncStatus: 'idle', // 'idle', 'syncing', 'error'
    
    // Enhanced sync queue system
    syncQueue: [], // New structured sync queue
    pendingActions: [], // Legacy - will be phased out
    
    // Socket connection state
    socket: null,
    socketConnected: false,
    socketReconnectAttempts: 0,
    socketMaxReconnectAttempts: 3,
    socketReconnectTimer: null,
    socketReconnectDelay: 1000, // Start with 1 second
    
    // Authentication
    currentUser: null,
    authToken: localStorage.getItem('auth_token'),
    
    // Project context
    currentProjectId: localStorage.getItem('current_project_id') || null,

    // Sync timers
    dragSyncTimer: null,
    syncRetryTimer: null,
    
    // Network monitoring
    networkStatusTimer: null,
    lastOnlineCheck: null,
  }),

  getters: {
    // Get tasks in tree structure
    taskTree: (state) => {
      const buildTree = (parentId = null) => {
        return state.tasks
          .filter((task) => task.parentId === parentId)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((task) => ({
            ...task,
            children: buildTree(task.id),
          }))
      }
      return buildTree()
    },

    // Get filtered tasks
    filteredTasks: (state) => {
      let filtered = [...state.tasks]

      if (state.filters.status) {
        filtered = filtered.filter((task) => task.status === state.filters.status)
      }

      if (state.filters.priority) {
        filtered = filtered.filter((task) => task.priority === state.filters.priority)
      }

      if (state.filters.tags.length > 0) {
        filtered = filtered.filter((task) =>
          task.tags.some((tag) => state.filters.tags.includes(tag)),
        )
      }

      if (state.filters.assignee) {
        filtered = filtered.filter((task) => task.assignee === state.filters.assignee)
      }

      return filtered
    },

    // Convert tasks to Gantt format
    ganttData: (state) => {
      const data = state.tasks.map((task) => {
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
          progress: task.status === 'done' ? 1 : task.status === 'in_progress' ? 0.5 : 0,
          type: 'task',
          // 添加額外資訊
          priority: task.priority,
          status: task.status,
          assignee: task.assignee,
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

      return { data, links }
    },

    // Get task by ID
    getTaskById: (state) => (id) => {
      return state.tasks.find((task) => task.id === id)
    },

    // Get task dependencies
    getTaskDependencies: (state) => (taskId) => {
      return state.tasks.filter((task) => task.dependencies.includes(taskId))
    },

    // Check if task can be marked as done (all dependencies completed)
    canMarkAsDone: (state) => (taskId) => {
      const task = state.tasks.find((t) => t.id === taskId)
      if (!task || !task.dependencies.length) return true

      return task.dependencies.every((depId) => {
        const depTask = state.tasks.find((t) => t.id === depId)
        return depTask && depTask.status === 'done'
      })
    },

    // Get blocked tasks (tasks that cannot proceed due to dependencies)
    getBlockedTasks: (state) => {
      return state.tasks.filter((task) => {
        if (task.status === 'done' || !task.dependencies.length) return false

        return task.dependencies.some((depId) => {
          const depTask = state.tasks.find((t) => t.id === depId)
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

        const task = state.tasks.find((t) => t.id === id)
        if (!task) return

        task.dependencies.forEach((depId) => {
          const depTask = state.tasks.find((t) => t.id === depId)
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

        const task = state.tasks.find((t) => t.id === id)
        if (!task) return false

        return task.dependencies.some((depId) => checkCircular(depId, new Set(visited)))
      }

      return newDependencies.some((depId) => checkCircular(depId))
    },

    // Project-related getters
    getTasksByProject: (state) => (projectId) => {
      if (!projectId) return []
      return state.tasks.filter((task) => task.projectId === projectId)
    },

    getCurrentProjectTasks: (state) => {
      if (!state.currentProjectId) return state.tasks
      return state.tasks.filter(
        (task) => task.projectId === state.currentProjectId || task.projectId === null,
      )
    },

    getCurrentProjectTaskTree: (state, getters) => {
      const projectTasks = getters.getCurrentProjectTasks
      const buildTree = (parentId = null) => {
        return projectTasks
          .filter((task) => task.parentId === parentId)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((task) => ({
            ...task,
            children: buildTree(task.id),
          }))
      }
      return buildTree()
    },

    getCurrentProjectFilteredTasks: (state, getters) => {
      let filtered = [...getters.getCurrentProjectTasks]

      if (state.filters.status) {
        filtered = filtered.filter((task) => task.status === state.filters.status)
      }

      if (state.filters.priority) {
        filtered = filtered.filter((task) => task.priority === state.filters.priority)
      }

      if (state.filters.tags.length > 0) {
        filtered = filtered.filter((task) =>
          task.tags.some((tag) => state.filters.tags.includes(tag)),
        )
      }

      if (state.filters.assignee) {
        filtered = filtered.filter((task) => task.assignee === state.filters.assignee)
      }

      return filtered
    },

    getCurrentProjectGanttData: (state, getters) => {
      const projectTasks = getters.getCurrentProjectTasks
      const data = projectTasks.map((task) => {
        const startDate = formatDateForGantt(task.startTime)
        const endDate = formatDateForGantt(task.endTime)

        let duration = 1
        if (startDate && endDate) {
          const start = new Date(startDate)
          const end = new Date(endDate)
          duration = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)))
        }

        const progress = task.status === 'done' ? 1 : task.status === 'in_progress' ? 0.5 : 0

        return {
          id: task.id,
          text: task.title,
          start_date: startDate || formatDateForGantt(new Date()),
          duration: duration,
          parent: task.parentId || null,
          progress: progress,
          priority: task.priority || 'medium',
          assignee: task.assignee || '',
          status: task.status || 'todo',
        }
      })

      const links = []
      projectTasks.forEach((task) => {
        task.dependencies?.forEach((depId) => {
          if (projectTasks.find((t) => t.id === depId)) {
            links.push({
              id: `${depId}-${task.id}`,
              source: depId,
              target: task.id,
              type: '0',
            })
          }
        })
      })

      return { data, links }
    },

    // Sync status getters
    syncQueueCount: (state) => state.syncQueue.length,
    
    pendingSyncOperations: (state) => {
      return state.syncQueue.filter(item => item.status === 'pending')
    },
    
    failedSyncOperations: (state) => {
      return state.syncQueue.filter(item => item.status === 'failed')
    },
    
    syncInProgress: (state) => {
      return state.syncQueue.some(item => item.status === 'syncing')
    },
    
    connectionStatus: (state) => {
      if (state.socketConnected && state.isOnline) return 'connected'
      if (state.isOnline) return 'reconnecting'
      return 'offline'
    },

    syncStatusText: (state, getters) => {
      const pendingCount = getters.pendingSyncOperations.length
      const failedCount = getters.failedSyncOperations.length
      
      if (getters.syncInProgress) return '同步中...'
      if (failedCount > 0) return `${failedCount} 項失敗`
      if (pendingCount > 0) return `${pendingCount} 項待同步`
      return '已同步'
    },
  },

  actions: {
    // Initialize backend connection with enhanced socket management
    async initializeBackend(projectId, userToken) {
      this.currentProjectId = projectId
      this.authToken = userToken

      if (userToken) {
        localStorage.setItem('auth_token', userToken)
      }

      // Initialize Socket.io with auto-reconnection
      if (userToken) {
        this.initializeSocket()
      }

      // Load initial data
      if (projectId) {
        await this.loadTasksFromServer()
      }

      // Monitor network status
      this.initializeNetworkMonitoring()
    },

    // Enhanced socket initialization with reconnection logic
    initializeSocket() {
      if (this.socket) {
        this.socket.disconnect()
      }

      this.socket = io(
        process.env.VUE_APP_API_URL?.replace('/api', '') || 'http://localhost:3000',
        {
          auth: { token: this.authToken },
          autoConnect: true,
          reconnection: false, // We'll handle reconnection manually
          timeout: 10000,
        },
      )

      // Connection successful
      this.socket.on('connect', () => {
        console.log('Socket connected successfully')
        this.socketConnected = true
        this.isOnline = true
        this.socketReconnectAttempts = 0
        this.socketReconnectDelay = 1000 // Reset delay
        
        // Clear any pending reconnection timer
        if (this.socketReconnectTimer) {
          clearTimeout(this.socketReconnectTimer)
          this.socketReconnectTimer = null
        }

        // Join current project room
        if (this.currentProjectId) {
          this.socket.emit('join:project', this.currentProjectId)
        }

        // Process sync queue
        this.processSyncQueue()
      })

      // Handle real-time updates
      this.socket.on('task:sync', (event) => {
        this.handleRealtimeSync(event)
      })

      // Connection lost
      this.socket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason)
        this.socketConnected = false
        
        // Only attempt reconnection if not manually disconnected
        if (reason !== 'io client disconnect') {
          this.attemptSocketReconnection()
        }
      })

      // Connection error
      this.socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error)
        this.socketConnected = false
        this.attemptSocketReconnection()
      })

      // Authentication error
      this.socket.on('auth_error', (error) => {
        console.error('Socket authentication error:', error)
        this.socketConnected = false
        // Don't retry on auth errors
        Notify.create({
          type: 'negative',
          message: '認證失敗，請重新登入',
          position: 'top',
        })
      })
    },

    // Smart socket reconnection with exponential backoff
    attemptSocketReconnection() {
      // Don't attempt if already trying to reconnect
      if (this.socketReconnectTimer) {
        return
      }

      // Check if we've exceeded max attempts
      if (this.socketReconnectAttempts >= this.socketMaxReconnectAttempts) {
        console.log('Max socket reconnection attempts reached, waiting 1 hour')
        
        // Wait 1 hour before trying again
        this.socketReconnectTimer = setTimeout(() => {
          this.socketReconnectAttempts = 0
          this.socketReconnectDelay = 1000
          this.socketReconnectTimer = null
          this.attemptSocketReconnection()
        }, 60 * 60 * 1000) // 1 hour
        
        return
      }

      console.log(`Attempting socket reconnection in ${this.socketReconnectDelay}ms (attempt ${this.socketReconnectAttempts + 1}/${this.socketMaxReconnectAttempts})`)

      this.socketReconnectTimer = setTimeout(() => {
        this.socketReconnectAttempts++
        this.socketReconnectTimer = null
        
        // Try to reconnect
        if (this.socket) {
          this.socket.connect()
        } else {
          this.initializeSocket()
        }
        
        // Increase delay for next attempt (exponential backoff)
        this.socketReconnectDelay = Math.min(this.socketReconnectDelay * 2, 30000) // Max 30 seconds
      }, this.socketReconnectDelay)
    },

    // Cleanup socket connection
    disconnectSocket() {
      if (this.socketReconnectTimer) {
        clearTimeout(this.socketReconnectTimer)
        this.socketReconnectTimer = null
      }
      
      if (this.socket) {
        this.socket.disconnect()
        this.socket = null
      }
      
      this.socketConnected = false
      this.socketReconnectAttempts = 0
    },

    // Load tasks from server
    async loadTasksFromServer() {
      if (!this.authToken) return

      try {
        this.syncStatus = 'syncing'

        const response = await api.get('/tasks', {
          params: {
            projectId: this.currentProjectId,
            since: this.lastUpdated,
          },
        })

        // Backend now uses camelCase, no conversion needed
        let newTasks = []
        if (response.data.tasks && Array.isArray(response.data.tasks)) {
          newTasks = response.data.tasks
        } else if (Array.isArray(response.data)) {
          newTasks = response.data
        }

        // Merge new tasks with existing tasks, replacing tasks from the same project
        if (this.currentProjectId) {
          // Remove existing tasks for this project
          this.tasks = this.tasks.filter(task => task.projectId !== this.currentProjectId)
          // Add new tasks for this project
          this.tasks.push(...newTasks)
        } else {
          // If no current project, replace all tasks
          this.tasks = newTasks
        }
        this.lastUpdated = new Date().toISOString()
        this.syncStatus = 'idle'
      } catch (error) {
        console.warn('載入任務失敗，使用本地快取:', error)
        this.loadFromLocalStorage()
        this.syncStatus = 'error'
        setTimeout(() => {
          Notify.create({
            type: 'negative',
            message: `載入任務失敗，使用本地快取資料: ${error.message}`,
            position: 'top',
          })
        }, 0)
      }
    },

    // Save to local storage
    saveToLocalStorage() {
      const dataToStore = {
        tasks: this.tasks,
        links: this.links,
        tags: this.tags,
        lastUpdated: this.lastUpdated,
        currentProjectId: this.currentProjectId,
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToStore))
    },

    // Load from local storage
    loadFromLocalStorage() {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        try {
          const data = JSON.parse(stored)
          
          // Load all tasks from storage (don't filter by project here)
          this.tasks = data.tasks || []
          
          this.links = data.links || []
          this.tags = data.tags || ['UI', 'Backend', 'Testing', 'Documentation']
          this.lastUpdated = data.lastUpdated
          
          // Don't override currentProjectId if it's already set
          if (!this.currentProjectId && data.currentProjectId) {
            this.currentProjectId = data.currentProjectId
          }
        } catch (e) {
          console.warn('Failed to load stored data:', e)
          // Use setTimeout to ensure Notify is called in proper context
          setTimeout(() => {
            Notify.create({
              type: 'warning',
              message: `載入本地儲存資料失敗: ${e.message}`,
              position: 'top',
            })
          }, 0)
        }
      }
    },

    // Network monitoring
    initializeNetworkMonitoring() {
      window.addEventListener('online', () => {
        this.isOnline = true
        this.syncPendingActions()
      })

      window.addEventListener('offline', () => {
        this.isOnline = false
      })
    },

    // Handle realtime sync
    handleRealtimeSync(event) {
      const { type, task, userId } = event

      // Ignore own operations
      if (userId === this.currentUser?.id) return

      if (type === 'created') {
        if (!this.tasks.find((t) => t.id === task.id)) {
          this.tasks.push(task)
        }
      } else if (type === 'updated') {
        const index = this.tasks.findIndex((t) => t.id === task.id)
        if (index !== -1) {
          this.tasks[index] = task
        }
      } else if (type === 'deleted') {
        this.tasks = this.tasks.filter((t) => t.id !== task.id)
      }

      this.updateTaskLinks()
    },

    // Enhanced sync queue processing with retry logic
    async processSyncQueue() {
      if (!this.socketConnected || !this.isOnline) {
        return
      }

      const pendingItems = this.syncQueue.filter(item => 
        item.status === 'pending' || item.status === 'failed'
      )

      if (pendingItems.length === 0) {
        return
      }

      console.log(`Processing ${pendingItems.length} items in sync queue`)

      for (const item of pendingItems) {
        // Skip if item is currently syncing
        if (item.status === 'syncing') {
          continue
        }

        // Check if we should retry failed items
        if (item.status === 'failed') {
          const timeSinceLastAttempt = Date.now() - new Date(item.lastAttempt).getTime()
          const minRetryDelay = this.calculateRetryDelay(item.retryCount)
          
          if (timeSinceLastAttempt < minRetryDelay) {
            continue // Not time to retry yet
          }
        }

        // Process the item
        await this.processSyncItem(item)
      }
    },

    // Process individual sync queue item
    async processSyncItem(item) {
      // Mark as syncing
      item.status = 'syncing'
      item.lastAttempt = new Date().toISOString()

      try {
        await this.executeSyncAction(item)
        
        // Success - remove from queue
        this.removeSyncQueueItem(item.id)
        console.log(`Successfully synced: ${item.action} ${item.entity}`)
        
      } catch (error) {
        console.error(`Sync failed for ${item.action} ${item.entity}:`, error)
        
        // Increment retry count
        item.retryCount = (item.retryCount || 0) + 1
        item.lastError = error.message
        
        // Check if we should keep retrying
        if (item.retryCount >= 5) {
          item.status = 'failed'
          
          // Notify user of permanent failure
          setTimeout(() => {
            Notify.create({
              type: 'negative',
              message: `操作同步失敗：${item.action} ${item.entity}`,
              position: 'top',
              actions: [
                {
                  label: '重試',
                  color: 'white',
                  handler: () => {
                    item.retryCount = 0
                    item.status = 'pending'
                    this.processSyncQueue()
                  }
                }
              ]
            })
          }, 0)
        } else {
          item.status = 'failed'
          
          // Schedule retry
          const retryDelay = this.calculateRetryDelay(item.retryCount)
          setTimeout(() => {
            if (item.status === 'failed') {
              item.status = 'pending'
              this.processSyncQueue()
            }
          }, retryDelay)
        }
      }
    },

    // Calculate exponential backoff delay
    calculateRetryDelay(retryCount) {
      // Start with 1 second, double each time, max 30 seconds
      return Math.min(1000 * Math.pow(2, retryCount), 30000)
    },

    // Add item to sync queue
    addToSyncQueue(action, entity, data, options = {}) {
      const queueItem = {
        id: uuidv4(),
        action, // 'create', 'update', 'delete'
        entity, // 'task', 'project'
        data,
        status: 'pending',
        createdAt: new Date().toISOString(),
        lastAttempt: null,
        retryCount: 0,
        lastError: null,
        priority: options.priority || 'normal', // 'high', 'normal', 'low'
        ...options
      }

      this.syncQueue.push(queueItem)
      
      // Sort by priority and creation time
      this.syncQueue.sort((a, b) => {
        const priorityOrder = { high: 3, normal: 2, low: 1 }
        const aPriority = priorityOrder[a.priority] || 2
        const bPriority = priorityOrder[b.priority] || 2
        
        if (aPriority !== bPriority) {
          return bPriority - aPriority // High priority first
        }
        
        return new Date(a.createdAt) - new Date(b.createdAt) // Older first
      })

      // Trigger immediate processing if connected
      if (this.socketConnected && this.isOnline) {
        this.processSyncQueue()
      }

      return queueItem.id
    },

    // Remove item from sync queue
    removeSyncQueueItem(itemId) {
      this.syncQueue = this.syncQueue.filter(item => item.id !== itemId)
    },

    // Clear all failed items from queue
    clearFailedSyncItems() {
      this.syncQueue = this.syncQueue.filter(item => item.status !== 'failed')
    },

    // Retry all failed items
    retryFailedSyncItems() {
      this.syncQueue.forEach(item => {
        if (item.status === 'failed') {
          item.retryCount = 0
          item.status = 'pending'
          item.lastError = null
        }
      })
      
      this.processSyncQueue()
    },

    // Legacy sync pending actions (for backward compatibility)
    async syncPendingActions() {
      return this.processSyncQueue()
    },

    // Execute sync action (enhanced to support both old and new formats)
    async executeSyncAction(item) {
      // Support both old pendingActions format and new syncQueue format
      const action = item.action || item.type
      const entity = item.entity || 'task'
      const data = item.data
      const entityId = item.entityId || item.taskId

      if (entity === 'task') {
        if (action === 'create') {
          const taskData = {
            ...data,
            projectId: this.currentProjectId,
          }

          const response = await api.post('/tasks', taskData)
          
          // If this was a temp task, replace it with server response
          if (item.tempId) {
            const index = this.tasks.findIndex((t) => t.id === item.tempId)
            if (index !== -1 && response.data.task) {
              this.tasks[index] = {
                ...response.data.task,
                _isTemp: false,
              }
            }
          }
          
        } else if (action === 'update') {
          await api.put(`/tasks/${entityId}`, data)
          
        } else if (action === 'delete') {
          await api.delete(`/tasks/${entityId}`)
        }
        
      } else if (entity === 'project') {
        if (action === 'create') {
          await api.post('/projects', data)
        } else if (action === 'update') {
          await api.put(`/projects/${entityId}`, data)
        } else if (action === 'delete') {
          await api.delete(`/projects/${entityId}`)
        }
      }
    },

    // Create new task (updated for backend)
    async createTask(taskData) {
      // Check if we have a current project
      if (!this.currentProjectId) {
        setTimeout(() => {
          Notify.create({
            type: 'warning',
            message: '請先選擇一個專案',
            position: 'top',
          })
        }, 0)
        return
      }

      const tempId = uuidv4()
      const newTask = {
        id: tempId,
        projectId: taskData.projectId || this.currentProjectId,
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
        updatedAt: new Date().toISOString(),
        _isTemp: true,
      }

      // Optimistic update UI
      this.tasks.push(newTask)

      // Force save to localStorage
      this.saveToLocalStorage()

      if (this.isOnline && this.authToken) {
        try {
          // Backend now uses camelCase, no conversion needed
          const backendTaskData = {
            ...taskData,
            projectId: this.currentProjectId,
          }

          const response = await api.post('/tasks', backendTaskData)

          // Replace temp task with server response
          const index = this.tasks.findIndex((t) => t.id === tempId)
          if (index !== -1 && response.data.task) {
            // Backend now uses camelCase, no conversion needed
            this.tasks[index] = {
              ...response.data.task,
              _isTemp: false,
            }
          }
        } catch (error) {
          this.addToSyncQueue('create', 'task', taskData, { 
            tempId,
            priority: 'high' 
          })
          console.warn('Task creation failed, added to sync queue:', error)
        }
      } else {
        this.addToSyncQueue('create', 'task', taskData, { 
          tempId,
          priority: 'high' 
        })
      }

      this.updateTaskLinks()
      
      return newTask
    },

    // Update task locally without backend sync (for drag and drop operations)
    updateTaskLocal(taskId, updates) {
      const index = this.tasks.findIndex((task) => task.id === taskId)
      if (index === -1) return

      // Update task locally
      this.tasks[index] = {
        ...this.tasks[index],
        ...updates,
        updatedAt: new Date().toISOString(),
      }

      // Force save to localStorage
      this.saveToLocalStorage()
    },

    // Update existing task (updated for backend)
    async updateTask(taskId, updates) {
      const index = this.tasks.findIndex((task) => task.id === taskId)
      if (index === -1) return

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

      const originalTask = { ...this.tasks[index] }

      // 用 map 產生新陣列，保證反應式
      this.tasks = this.tasks.map((task, i) =>
        i === index ? { ...originalTask, ...updates, updatedAt: new Date().toISOString() } : task,
      )

      console.log(this.tasks[index])

      // Force save to localStorage after update
      this.saveToLocalStorage()

      if (this.isOnline && this.authToken) {
        try {
          // Backend now uses camelCase, no conversion needed
          const backendUpdates = {
            ...updates,
            version: originalTask.version,
          }

          const response = await api.put(`/tasks/${taskId}`, backendUpdates)

          // Backend now uses camelCase, no conversion needed
          if (response.data.task) {
            this.tasks[index] = response.data.task
          } else {
            this.tasks[index] = response.data
          }
        } catch (error) {
          if (error.response?.status === 409) {
            // Version conflict - server wins for simplicity
            await this.loadTasksFromServer()
            setTimeout(() => {
              Notify.create({
                type: 'warning',
                message: `任務版本衝突，已重新載入最新資料: ${error.message}`,
                position: 'top',
              })
            }, 0)
          } else {
            // Rollback and queue for later
            this.tasks[index] = originalTask
            this.pendingActions.push({
              type: 'update',
              taskId,
              data: updates,
            })
            setTimeout(() => {
              Notify.create({
                type: 'negative',
                message: `更新任務失敗，已加入待同步佇列: ${error.message}`,
                position: 'top',
              })
            }, 0)
          }
        }
      } else {
        this.pendingActions.push({
          type: 'update',
          taskId,
          data: updates,
        })
      }

      // Auto-block dependent tasks if this task is blocked
      if (updates.status === 'blocked') {
        this.autoBlockDependentTasks(taskId)
      }

      this.updateTaskLinks()
    },

    // Delete task and its children (updated for backend)
    async deleteTask(taskId) {
      const taskToDelete = this.tasks.find((t) => t.id === taskId)
      if (!taskToDelete) return

      const deleteRecursive = (id) => {
        // Delete children first
        const children = this.tasks.filter((task) => task.parentId === id)
        children.forEach((child) => deleteRecursive(child.id))

        // Remove from tasks array
        this.tasks = this.tasks.filter((task) => task.id !== id)

        // Remove from dependencies of other tasks
        this.tasks.forEach((task) => {
          task.dependencies = task.dependencies.filter((depId) => depId !== id)
        })
      }

      // Optimistic delete
      deleteRecursive(taskId)

      // Force save to localStorage after delete
      this.saveToLocalStorage()

      if (this.isOnline && this.authToken) {
        try {
          await api.delete(`/tasks/${taskId}`)
        } catch (error) {
          // Restore task on error
          this.tasks.push(taskToDelete)
          this.pendingActions.push({
            type: 'delete',
            taskId,
          })
          setTimeout(() => {
            Notify.create({
              type: 'negative',
              message: `刪除任務失敗，已加入待同步佇列: ${error.message}`,
              position: 'top',
            })
          }, 0)
        }
      } else {
        this.pendingActions.push({
          type: 'delete',
          taskId,
        })
      }

      this.updateTaskLinks()
    },

    // Update task order after drag and drop
    updateTaskOrder(taskId, newParentId, newIndex) {
      console.log('[TaskStore] updateTaskOrder:', taskId, 'newParentId:', newParentId, 'newIndex:', newIndex)
      
      const task = this.tasks.find((t) => t.id === taskId)
      if (!task) {
        console.warn('Task not found:', taskId)
        return
      }
      
      console.log('[TaskStore] Current task:', task.title, 'parentId:', task.parentId, 'sortOrder:', task.sortOrder)

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

      // 先更新目標 task 的 parentId 與 sortOrder
      const updatedTask = {
        ...task,
        parentId: newParentId,
        sortOrder: newIndex + 1,
        updatedAt: new Date().toISOString(),
      }

      // 重新排序新父節點下的兄弟
      let newSiblings = this.tasks
        .filter((t) => t.parentId === newParentId && t.id !== taskId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
      newSiblings.splice(newIndex, 0, updatedTask)
      newSiblings = newSiblings.map((sibling, idx) => ({ ...sibling, sortOrder: idx + 1 }))

      // 如果有跨父節點，舊父節點下的兄弟也要重排
      let oldSiblings = []
      if (oldParentId !== newParentId && oldParentId) {
        oldSiblings = this.tasks
          .filter((t) => t.parentId === oldParentId && t.id !== taskId)
          .sort((a, b) => a.sortOrder - b.sortOrder)
        oldSiblings = oldSiblings.map((sibling, idx) => ({ ...sibling, sortOrder: idx + 1 }))
      }

      // Update tasks individually to preserve Vue reactivity
      const taskIndex = this.tasks.findIndex(t => t.id === taskId)
      if (taskIndex !== -1) {
        this.tasks[taskIndex] = updatedTask
      }
      
      // Update new siblings
      newSiblings.forEach(sibling => {
        if (sibling.id !== taskId) {
          const siblingIndex = this.tasks.findIndex(t => t.id === sibling.id)
          if (siblingIndex !== -1) {
            this.tasks[siblingIndex] = sibling
          }
        }
      })
      
      // Update old siblings if different parent
      if (oldParentId !== newParentId) {
        oldSiblings.forEach(sibling => {
          const siblingIndex = this.tasks.findIndex(t => t.id === sibling.id)
          if (siblingIndex !== -1) {
            this.tasks[siblingIndex] = sibling
          }
        })
      }

      // Force save to localStorage after drag and drop
      this.saveToLocalStorage()

      // For drag and drop, delay backend sync to avoid version conflicts during rapid operations
      this.debouncedSyncTaskOrder(taskId, {
        parentId: newParentId,
        sortOrder: updatedTask.sortOrder,
      })

      // Update task links to reflect new structure
      this.updateTaskLinks()
      
      console.log('[TaskStore] updateTaskOrder completed, tasks count:', this.tasks.length)
      console.log('[TaskStore] Updated task:', this.tasks.find(t => t.id === taskId))
    },

    // Debounced sync for drag and drop operations
    debouncedSyncTaskOrder(taskId, updates) {
      // Clear previous timer
      if (this.dragSyncTimer) {
        clearTimeout(this.dragSyncTimer)
      }

      // Set new timer for delayed sync
      this.dragSyncTimer = setTimeout(async () => {
        if (this.isOnline && this.authToken) {
          try {
            // Use the backend update but with specific handling for drag operations
            await this.updateTask(taskId, updates)
          } catch (error) {
            // If sync fails, queue for later instead of showing error
            this.pendingActions.push({
              type: 'update',
              taskId,
              data: updates,
            })
            console.warn('Drag sync failed, queued for later:', error)
          }
        }
        this.dragSyncTimer = null
      }, 1000) // 1 second delay to allow for rapid drag operations
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

        const currentTask = this.tasks.find((t) => t.id === currentId)
        if (!currentTask) break

        currentId = currentTask.parentId
        if (currentId === sourceId) return true
      }

      return false
    },

    // Get next sort order for a parent
    getNextSortOrder(parentId) {
      const siblings = this.tasks.filter((task) => task.parentId === parentId)
      return siblings.length > 0 ? Math.max(...siblings.map((t) => t.sortOrder)) + 1 : 1
    },

    // Update task links based on dependencies
    updateTaskLinks() {
      this.links = []
      this.tasks.forEach((task) => {
        if (task.dependencies && Array.isArray(task.dependencies)) {
          task.dependencies.forEach((depId) => {
            this.links.push({
              source: depId,
              target: task.id,
              type: '0', // finish_to_start
            })
          })
        }
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
        dateRange: null,
      }
    },

    // Set current view
    setCurrentView(view) {
      this.currentView = view
    },

    // Set current project
    async setCurrentProject(projectId) {
      const previousProjectId = this.currentProjectId
      this.currentProjectId = projectId

      // Force immediate save to localStorage
      this.saveCurrentProjectId()

      // Clear UI state when switching projects
      if (previousProjectId !== projectId) {
        // Clear expanded state and filters when switching projects
        this.expandedTasks.splice(0, this.expandedTasks.length)
        this.clearFilters()
      }

      // Load tasks for the new project if authenticated and online
      if (projectId && this.authToken) {
        await this.loadTasksFromServer()
      } else if (projectId) {
        // If not authenticated, load from local storage
        this.loadFromLocalStorage()
      }
    },

    // Force save current project ID to localStorage immediately
    saveCurrentProjectId() {
      if (this.currentProjectId) {
        localStorage.setItem('current_project_id', this.currentProjectId)
      } else {
        localStorage.removeItem('current_project_id')
      }
    },

    // Force reload all tasks from server, clearing local cache
    async forceReloadTasks() {
      if (!this.currentProjectId) {
        setTimeout(() => {
          Notify.create({
            type: 'warning',
            message: '請先選擇一個專案',
            position: 'top',
          })
        }, 0)
        return
      }

      // Clear all local data
      this.tasks = []
      this.links = []
      this.lastUpdated = null
      this.expandedTasks.splice(0, this.expandedTasks.length)
      this.clearFilters()
      
      // Clear localStorage for this project
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        try {
          const data = JSON.parse(stored)
          data.tasks = []
          data.links = []
          data.lastUpdated = null
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
        } catch {
          // If parsing fails, just remove the storage
          localStorage.removeItem(STORAGE_KEY)
        }
      }

      // Force reload from server
      if (this.authToken) {
        try {
          await this.loadTasksFromServer()
          setTimeout(() => {
            Notify.create({
              type: 'positive',
              message: '任務已重新載入',
              position: 'top',
            })
          }, 0)
        } catch (error) {
          setTimeout(() => {
            Notify.create({
              type: 'negative',
              message: `重新載入任務失敗: ${error.message}`,
              position: 'top',
            })
          }, 0)
        }
      } else {
        setTimeout(() => {
          Notify.create({
            type: 'warning',
            message: '請先登入以重新載入任務',
            position: 'top',
          })
        }, 0)
      }
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
          taskList.forEach((task) => {
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
      const task = this.tasks.find((t) => t.id === taskId)
      if (task && task.children && task.children.length > 0) {
        // Add the task itself to expanded state
        if (!this.expandedTasks.includes(taskId)) {
          this.expandedTasks.push(taskId)
        }

        // Find tasks that have this task as parent and have children
        const directChildren = this.tasks.filter(
          (t) => t.parentId === taskId && this.tasks.some((child) => child.parentId === t.id),
        )

        directChildren.forEach((child) => {
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
        const children = this.tasks.filter((t) => t.parentId === parentId)
        children.forEach((child) => {
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
      descendants.forEach((id) => {
        const index = this.expandedTasks.indexOf(id)
        if (index !== -1) {
          this.expandedTasks.splice(index, 1)
        }
      })
    },

    // Duplicate task
    duplicateTask(taskId) {
      const originalTask = this.tasks.find((task) => task.id === taskId)
      if (!originalTask) return null

      const duplicatedTask = {
        ...originalTask,
        id: uuidv4(),
        title: `${originalTask.title} (副本)`,
        dependencies: [], // Clear dependencies for duplicated task
        sortOrder: this.getNextSortOrder(originalTask.parentId),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      this.tasks.push(duplicatedTask)
      this.updateTaskLinks()

      // Force save to localStorage after duplicate
      this.saveToLocalStorage()

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
      this.tags = this.tags.filter((t) => t !== tag)
    },

    // Auto-block dependent tasks
    autoBlockDependentTasks(taskId) {
      const dependentTasks = this.tasks.filter(
        (task) => task.dependencies.includes(taskId) && task.status !== 'done',
      )

      dependentTasks.forEach((task) => {
        if (task.status !== 'blocked') {
          task.status = 'blocked'
          task.updatedAt = new Date().toISOString()
        }
      })
    },

    // Validate and fix task dependencies
    validateTaskDependencies() {
      let fixCount = 0

      this.tasks.forEach((task) => {
        // Remove invalid dependencies (tasks that don't exist)
        const validDependencies = task.dependencies.filter((depId) =>
          this.tasks.find((t) => t.id === depId),
        )

        if (validDependencies.length !== task.dependencies.length) {
          task.dependencies = validDependencies
          fixCount++
        }

        // Auto-block tasks with incomplete dependencies
        if (task.status !== 'done' && task.dependencies.length > 0) {
          const hasIncompleteDeps = task.dependencies.some((depId) => {
            const depTask = this.tasks.find((t) => t.id === depId)
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
  },

  // Install persistence plugin
  plugins: [persistencePlugin],
})
