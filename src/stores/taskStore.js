import { defineStore } from 'pinia'
import { v4 as uuidv4 } from 'uuid'
import { api } from 'src/boot/axios'
import { io } from 'socket.io-client'

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
        lastUpdated: Date.now(),
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
    pendingActions: [], // 離線時的待同步操作
    currentProjectId: null,
    currentUser: null,
    socket: null,
    authToken: localStorage.getItem('auth_token'),
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
  },

  actions: {
    // Initialize backend connection
    async initializeBackend(projectId, userToken) {
      this.currentProjectId = projectId;
      this.authToken = userToken;
      
      if (userToken) {
        localStorage.setItem('auth_token', userToken);
      }
      
      // Initialize Socket.io
      if (userToken) {
        this.socket = io(process.env.VUE_APP_API_URL?.replace('/api', '') || 'http://localhost:3000', {
          auth: { token: userToken }
        });

        this.socket.on('connect', () => {
          this.isOnline = true;
          if (projectId) {
            this.socket.emit('join:project', projectId);
          }
          this.syncPendingActions();
        });

        this.socket.on('task:sync', (event) => {
          this.handleRealtimeSync(event);
        });

        this.socket.on('disconnect', () => {
          this.isOnline = false;
        });
      }

      // Load initial data
      if (projectId) {
        await this.loadTasksFromServer();
      }
      
      // Monitor network status
      this.initializeNetworkMonitoring();
    },

    // Load tasks from server
    async loadTasksFromServer() {
      if (!this.authToken) return;
      
      try {
        this.syncStatus = 'syncing';
        
        const response = await api.get('/tasks', {
          params: { 
            project_id: this.currentProjectId,
            since: this.lastUpdated 
          }
        });

        this.tasks = response.data;
        this.lastUpdated = new Date().toISOString();
        this.syncStatus = 'idle';
        
        // Update local cache
        this.saveToLocalStorage();
        
      } catch (error) {
        console.warn('載入任務失敗，使用本地快取:', error);
        this.loadFromLocalStorage();
        this.syncStatus = 'error';
      }
    },

    // Save to local storage
    saveToLocalStorage() {
      const dataToStore = {
        tasks: this.tasks,
        links: this.links,
        tags: this.tags,
        lastUpdated: this.lastUpdated,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToStore));
    },

    // Load from local storage
    loadFromLocalStorage() {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const data = JSON.parse(stored);
          this.tasks = data.tasks || [];
          this.links = data.links || [];
          this.tags = data.tags || ['UI', 'Backend', 'Testing', 'Documentation'];
          this.lastUpdated = data.lastUpdated;
        } catch (e) {
          console.warn('Failed to load stored data:', e);
        }
      }
    },

    // Network monitoring
    initializeNetworkMonitoring() {
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.syncPendingActions();
      });

      window.addEventListener('offline', () => {
        this.isOnline = false;
      });
    },

    // Handle realtime sync
    handleRealtimeSync(event) {
      const { type, task, userId } = event;

      // Ignore own operations
      if (userId === this.currentUser?.id) return;

      switch (type) {
        case 'created':
          if (!this.tasks.find(t => t.id === task.id)) {
            this.tasks.push(task);
          }
          break;
        case 'updated':
          const index = this.tasks.findIndex(t => t.id === task.id);
          if (index !== -1) {
            this.tasks[index] = task;
          }
          break;
        case 'deleted':
          this.tasks = this.tasks.filter(t => t.id !== task.id);
          break;
      }

      this.updateTaskLinks();
    },

    // Sync pending actions
    async syncPendingActions() {
      if (!this.isOnline || this.pendingActions.length === 0) return;

      const actionsToSync = [...this.pendingActions];
      this.pendingActions = [];

      for (const action of actionsToSync) {
        try {
          await this.executeSyncAction(action);
        } catch (error) {
          this.pendingActions.push(action);
        }
      }

      if (actionsToSync.length > 0) {
        await this.loadTasksFromServer();
      }
    },

    // Execute sync action
    async executeSyncAction(action) {
      switch (action.type) {
        case 'create':
          const response = await api.post('/tasks', {
            ...action.data,
            project_id: this.currentProjectId
          });
          
          // Replace temp task
          this.tasks = this.tasks.filter(t => t.id !== action.tempId);
          break;

        case 'update':
          await api.put(`/tasks/${action.taskId}`, action.data);
          break;

        case 'delete':
          await api.delete(`/tasks/${action.taskId}`);
          break;
      }
    },

    // Create new task (updated for backend)
    async createTask(taskData) {
      const tempId = uuidv4();
      const newTask = {
        id: tempId,
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
        _isTemp: true
      }

      // Optimistic update UI
      this.tasks.push(newTask);

      if (this.isOnline && this.authToken) {
        try {
          const response = await api.post('/tasks', {
            ...taskData,
            project_id: this.currentProjectId
          });

          // Replace temp task
          const index = this.tasks.findIndex(t => t.id === tempId);
          if (index !== -1) {
            this.tasks[index] = response.data;
          }

        } catch (error) {
          this.pendingActions.push({
            type: 'create',
            data: taskData,
            tempId
          });
        }
      } else {
        this.pendingActions.push({
          type: 'create',
          data: taskData,
          tempId
        });
      }

      this.updateTaskLinks();
      return newTask;
    },

    // Update existing task (updated for backend)
    async updateTask(taskId, updates) {
      const index = this.tasks.findIndex((task) => task.id === taskId)
      if (index === -1) return;

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

      const originalTask = { ...this.tasks[index] };
      
      // Optimistic update
      this.tasks[index] = {
        ...originalTask,
        ...updates,
        updatedAt: new Date().toISOString()
      };

      if (this.isOnline && this.authToken) {
        try {
          const response = await api.put(`/tasks/${taskId}`, {
            ...updates,
            version: originalTask.version
          });

          this.tasks[index] = response.data;

        } catch (error) {
          if (error.response?.status === 409) {
            // Version conflict - server wins for simplicity
            await this.loadTasksFromServer();
          } else {
            // Rollback and queue for later
            this.tasks[index] = originalTask;
            this.pendingActions.push({
              type: 'update',
              taskId,
              data: updates
            });
          }
        }
      } else {
        this.pendingActions.push({
          type: 'update',
          taskId,
          data: updates
        });
      }

      // Auto-block dependent tasks if this task is blocked
      if (updates.status === 'blocked') {
        this.autoBlockDependentTasks(taskId)
      }

      this.updateTaskLinks();
    },

    // Delete task and its children (updated for backend)
    async deleteTask(taskId) {
      const taskToDelete = this.tasks.find(t => t.id === taskId);
      if (!taskToDelete) return;

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
      deleteRecursive(taskId);

      if (this.isOnline && this.authToken) {
        try {
          await api.delete(`/tasks/${taskId}`);
        } catch (error) {
          // Restore task on error
          this.tasks.push(taskToDelete);
          this.pendingActions.push({
            type: 'delete',
            taskId
          });
        }
      } else {
        this.pendingActions.push({
          type: 'delete',
          taskId
        });
      }

      this.updateTaskLinks();
    },

    // Update task order after drag and drop
    updateTaskOrder(taskId, newParentId, newIndex) {
      const task = this.tasks.find((t) => t.id === taskId)
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
        .filter((t) => t.parentId === newParentId && t.id !== taskId)
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
          .filter((t) => t.parentId === oldParentId)
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
        task.dependencies.forEach((depId) => {
          this.links.push({
            source: depId,
            target: task.id,
            type: '0', // finish_to_start
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
        dateRange: null,
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
        const usabilityTaskId = uuidv4()

        // Level 2 - Detailed tasks under UI Design
        const colorSchemeTaskId = uuidv4()
        const componentsTaskId = uuidv4()
        const responsiveTaskId = uuidv4()
        const iconDesignTaskId = uuidv4()
        const typographyTaskId = uuidv4()
        const animationTaskId = uuidv4()

        // Level 2 - Detailed tasks under Wireframe
        const userFlowTaskId = uuidv4()
        const layoutTaskId = uuidv4()
        const navigationTaskId = uuidv4()

        // Level 2 - Detailed tasks under Prototype
        const interactionTaskId = uuidv4()
        const microAnimationTaskId = uuidv4()
        const userTestingTaskId = uuidv4()

        // Level 1 - Sub-phases under Development
        const frontendTaskId = uuidv4()
        const backendTaskId = uuidv4()
        const databaseTaskId = uuidv4()
        const mobileTaskId = uuidv4()
        const devOpsTaskId = uuidv4()

        // Level 2 - Detailed tasks under Frontend
        const authPageTaskId = uuidv4()
        const dashboardTaskId = uuidv4()
        const apiIntegrationTaskId = uuidv4()
        const routingTaskId = uuidv4()
        const stateManagementTaskId = uuidv4()
        const formValidationTaskId = uuidv4()

        // Level 2 - Detailed tasks under Backend
        const authApiTaskId = uuidv4()
        const userApiTaskId = uuidv4()
        const dataApiTaskId = uuidv4()
        const fileUploadTaskId = uuidv4()
        const notificationTaskId = uuidv4()
        const loggingTaskId = uuidv4()

        // Level 2 - Detailed tasks under Database
        const schemaDesignTaskId = uuidv4()
        const indexOptimizationTaskId = uuidv4()
        const migrationTaskId = uuidv4()
        const backupStrategyTaskId = uuidv4()

        // Level 2 - Detailed tasks under Mobile
        const reactNativeSetupTaskId = uuidv4()
        const mobileUITaskId = uuidv4()
        const pushNotificationTaskId = uuidv4()
        const offlineSyncTaskId = uuidv4()

        // Level 1 - Sub-phases under Testing
        const unitTestTaskId = uuidv4()
        const integrationTestTaskId = uuidv4()
        const e2eTestTaskId = uuidv4()
        const performanceTestTaskId = uuidv4()
        const securityTestTaskId = uuidv4()
        const uatTaskId = uuidv4()

        // Level 2 - Detailed tasks under Unit Testing
        const frontendUnitTestTaskId = uuidv4()
        const backendUnitTestTaskId = uuidv4()
        const testCoverageTaskId = uuidv4()

        // Level 2 - Detailed tasks under Integration Testing
        const apiTestTaskId = uuidv4()
        const dbIntegrationTestTaskId = uuidv4()
        const thirdPartyIntegrationTestTaskId = uuidv4()

        // Level 2 - Detailed tasks under E2E Testing
        const userJourneyTestTaskId = uuidv4()
        const crossBrowserTestTaskId = uuidv4()
        const mobileE2eTestTaskId = uuidv4()

        // Level 1 - Sub-phases under Deployment
        const infraSetupTaskId = uuidv4()
        const cicdTaskId = uuidv4()
        const monitoringTaskId = uuidv4()
        const documentationTaskId = uuidv4()
        const trainingTaskId = uuidv4()

        // Level 2 - Detailed tasks under Infrastructure
        const serverSetupTaskId = uuidv4()
        const loadBalancerTaskId = uuidv4()
        const cdnSetupTaskId = uuidv4()
        const sslCertTaskId = uuidv4()

        // Level 2 - Detailed tasks under CI/CD
        const buildPipelineTaskId = uuidv4()
        const testAutomationTaskId = uuidv4()
        const deploymentScriptTaskId = uuidv4()
        const rollbackStrategyTaskId = uuidv4()

        // Level 2 - Detailed tasks under Monitoring
        const logsMonitoringTaskId = uuidv4()
        const metricsTaskId = uuidv4()
        const alertingTaskId = uuidv4()
        const dashboardSetupTaskId = uuidv4()

        // Level 3 - Granular tasks under Auth API
        const jwtTaskId = uuidv4()
        const validationTaskId = uuidv4()
        const passwordEncryptionTaskId = uuidv4()
        const sessionManagementTaskId = uuidv4()
        const oauthIntegrationTaskId = uuidv4()

        // Level 3 - Granular tasks under User API
        const profileManagementTaskId = uuidv4()
        const permissionSystemTaskId = uuidv4()
        const userPreferencesTaskId = uuidv4()

        // Level 3 - Granular tasks under Data API
        const dataValidationTaskId = uuidv4()
        const cacheImplementationTaskId = uuidv4()
        const searchFunctionalityTaskId = uuidv4()
        const reportGenerationTaskId = uuidv4()

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
            updatedAt: new Date().toISOString(),
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
            updatedAt: new Date().toISOString(),
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
            updatedAt: new Date().toISOString(),
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
            updatedAt: new Date().toISOString(),
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
            updatedAt: new Date().toISOString(),
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
            updatedAt: new Date().toISOString(),
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
            updatedAt: new Date().toISOString(),
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
            updatedAt: new Date().toISOString(),
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
            updatedAt: new Date().toISOString(),
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
            updatedAt: new Date().toISOString(),
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
            updatedAt: new Date().toISOString(),
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
            updatedAt: new Date().toISOString(),
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
            updatedAt: new Date().toISOString(),
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
            updatedAt: new Date().toISOString(),
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
            updatedAt: new Date().toISOString(),
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
            updatedAt: new Date().toISOString(),
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
            updatedAt: new Date().toISOString(),
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
            updatedAt: new Date().toISOString(),
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
            updatedAt: new Date().toISOString(),
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
            updatedAt: new Date().toISOString(),
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
            updatedAt: new Date().toISOString(),
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
            updatedAt: new Date().toISOString(),
          },

          // Additional Level 1 - Design sub-tasks
          {
            id: usabilityTaskId,
            parentId: designTaskId,
            title: '🔍 易用性測試',
            description: '進行使用者體驗測試和改善建議',
            startTime: '2025-08-03T09:00:00',
            endTime: '2025-08-05T17:00:00',
            assignee: 'ux.researcher',
            status: 'todo',
            priority: 'medium',
            tags: ['Usability', 'Research'],
            dependencies: [prototypeTaskId],
            sortOrder: 4,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },

          // Additional Level 2 - UI Design detailed tasks
          {
            id: iconDesignTaskId,
            parentId: uiDesignTaskId,
            title: '🎯 圖示設計',
            description: '設計一致性的圖示系統',
            startTime: '2025-07-30T09:00:00',
            endTime: '2025-07-31T17:00:00',
            assignee: 'ui.designer',
            status: 'todo',
            priority: 'low',
            tags: ['Icons', 'Design System'],
            dependencies: [colorSchemeTaskId],
            sortOrder: 4,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: typographyTaskId,
            parentId: uiDesignTaskId,
            title: '📝 字體系統',
            description: '設定字體階層和排版規範',
            startTime: '2025-07-29T09:00:00',
            endTime: '2025-07-30T17:00:00',
            assignee: 'ui.designer',
            status: 'todo',
            priority: 'medium',
            tags: ['Typography', 'Design System'],
            dependencies: [colorSchemeTaskId],
            sortOrder: 5,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: animationTaskId,
            parentId: uiDesignTaskId,
            title: '✨ 動畫設計',
            description: '設計介面轉場和微互動動畫',
            startTime: '2025-08-01T09:00:00',
            endTime: '2025-08-02T17:00:00',
            assignee: 'ui.designer',
            status: 'todo',
            priority: 'low',
            tags: ['Animation', 'Interaction'],
            dependencies: [componentsTaskId],
            sortOrder: 6,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },

          // Level 2 - Wireframe detailed tasks
          {
            id: userFlowTaskId,
            parentId: wireframeTaskId,
            title: '🔄 使用者流程',
            description: '設計完整的使用者操作流程圖',
            startTime: '2025-07-23T09:00:00',
            endTime: '2025-07-24T17:00:00',
            assignee: 'ux.designer',
            status: 'done',
            priority: 'high',
            tags: ['User Flow', 'UX'],
            dependencies: [planningTaskId],
            sortOrder: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: layoutTaskId,
            parentId: wireframeTaskId,
            title: '📐 版面規劃',
            description: '設計頁面布局和元件配置',
            startTime: '2025-07-24T09:00:00',
            endTime: '2025-07-25T17:00:00',
            assignee: 'ux.designer',
            status: 'done',
            priority: 'high',
            tags: ['Layout', 'Structure'],
            dependencies: [userFlowTaskId],
            sortOrder: 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: navigationTaskId,
            parentId: wireframeTaskId,
            title: '🧭 導航設計',
            description: '規劃網站導航結構和資訊架構',
            startTime: '2025-07-25T09:00:00',
            endTime: '2025-07-26T17:00:00',
            assignee: 'ux.designer',
            status: 'done',
            priority: 'high',
            tags: ['Navigation', 'IA'],
            dependencies: [layoutTaskId],
            sortOrder: 3,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },

          // Level 2 - Prototype detailed tasks
          {
            id: interactionTaskId,
            parentId: prototypeTaskId,
            title: '👆 互動設計',
            description: '設計使用者互動邏輯和回饋',
            startTime: '2025-08-01T09:00:00',
            endTime: '2025-08-03T17:00:00',
            assignee: 'prototype.designer',
            status: 'todo',
            priority: 'medium',
            tags: ['Interaction', 'UX'],
            dependencies: [componentsTaskId],
            sortOrder: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: microAnimationTaskId,
            parentId: prototypeTaskId,
            title: '🎭 微動畫',
            description: '實作細節動畫和轉場效果',
            startTime: '2025-08-03T09:00:00',
            endTime: '2025-08-04T17:00:00',
            assignee: 'prototype.designer',
            status: 'todo',
            priority: 'low',
            tags: ['Animation', 'Detail'],
            dependencies: [interactionTaskId],
            sortOrder: 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: userTestingTaskId,
            parentId: prototypeTaskId,
            title: '👥 使用者測試',
            description: '邀請使用者測試原型並收集回饋',
            startTime: '2025-08-04T09:00:00',
            endTime: '2025-08-05T17:00:00',
            assignee: 'ux.researcher',
            status: 'todo',
            priority: 'medium',
            tags: ['User Testing', 'Research'],
            dependencies: [microAnimationTaskId],
            sortOrder: 3,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },

          // Additional Level 1 - Development sub-tasks
          {
            id: mobileTaskId,
            parentId: developmentTaskId,
            title: '📱 行動應用開發',
            description: '開發跨平台行動應用程式',
            startTime: '2025-08-10T09:00:00',
            endTime: '2025-08-25T17:00:00',
            assignee: 'mobile.dev',
            status: 'todo',
            priority: 'medium',
            tags: ['Mobile', 'React Native'],
            dependencies: [backendTaskId],
            sortOrder: 4,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: devOpsTaskId,
            parentId: developmentTaskId,
            title: '⚙️ DevOps 整合',
            description: '建立自動化部署和監控系統',
            startTime: '2025-08-15T09:00:00',
            endTime: '2025-08-25T17:00:00',
            assignee: 'devops.engineer',
            status: 'todo',
            priority: 'high',
            tags: ['DevOps', 'Automation'],
            dependencies: [databaseTaskId],
            sortOrder: 5,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },

          // Additional Level 2 - Frontend detailed tasks
          {
            id: routingTaskId,
            parentId: frontendTaskId,
            title: '🛣️ 路由管理',
            description: '實作前端路由和導航邏輯',
            startTime: '2025-08-02T09:00:00',
            endTime: '2025-08-04T17:00:00',
            assignee: 'frontend.dev',
            status: 'todo',
            priority: 'high',
            tags: ['Routing', 'Navigation'],
            dependencies: [navigationTaskId],
            sortOrder: 4,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: stateManagementTaskId,
            parentId: frontendTaskId,
            title: '🗃️ 狀態管理',
            description: '實作全域狀態管理系統',
            startTime: '2025-08-07T09:00:00',
            endTime: '2025-08-09T17:00:00',
            assignee: 'frontend.dev',
            status: 'todo',
            priority: 'high',
            tags: ['State', 'Redux'],
            dependencies: [routingTaskId],
            sortOrder: 5,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: formValidationTaskId,
            parentId: frontendTaskId,
            title: '✅ 表單驗證',
            description: '實作前端表單驗證邏輯',
            startTime: '2025-08-13T09:00:00',
            endTime: '2025-08-15T17:00:00',
            assignee: 'frontend.dev',
            status: 'todo',
            priority: 'medium',
            tags: ['Form', 'Validation'],
            dependencies: [stateManagementTaskId],
            sortOrder: 6,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },

          // Additional Level 2 - Backend detailed tasks
          {
            id: fileUploadTaskId,
            parentId: backendTaskId,
            title: '📤 檔案上傳 API',
            description: '實作檔案上傳和管理功能',
            startTime: '2025-08-16T09:00:00',
            endTime: '2025-08-18T17:00:00',
            assignee: 'backend.dev',
            status: 'todo',
            priority: 'medium',
            tags: ['File Upload', 'Storage'],
            dependencies: [userApiTaskId],
            sortOrder: 4,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: notificationTaskId,
            parentId: backendTaskId,
            title: '🔔 通知系統',
            description: '實作即時通知和訊息推送',
            startTime: '2025-08-17T09:00:00',
            endTime: '2025-08-20T17:00:00',
            assignee: 'backend.dev',
            status: 'todo',
            priority: 'medium',
            tags: ['Notification', 'WebSocket'],
            dependencies: [userApiTaskId],
            sortOrder: 5,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: loggingTaskId,
            parentId: backendTaskId,
            title: '📊 日誌系統',
            description: '建立系統日誌記錄和分析',
            startTime: '2025-08-19T09:00:00',
            endTime: '2025-08-20T17:00:00',
            assignee: 'backend.dev',
            status: 'todo',
            priority: 'low',
            tags: ['Logging', 'Analytics'],
            dependencies: [dataApiTaskId],
            sortOrder: 6,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },

          // Level 2 - Database detailed tasks
          {
            id: schemaDesignTaskId,
            parentId: databaseTaskId,
            title: '📋 資料庫架構',
            description: '設計完整的資料庫表格結構',
            startTime: '2025-08-01T09:00:00',
            endTime: '2025-08-03T17:00:00',
            assignee: 'db.architect',
            status: 'todo',
            priority: 'high',
            tags: ['Schema', 'Design'],
            dependencies: [planningTaskId],
            sortOrder: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: indexOptimizationTaskId,
            parentId: databaseTaskId,
            title: '⚡ 索引優化',
            description: '建立和優化資料庫索引策略',
            startTime: '2025-08-04T09:00:00',
            endTime: '2025-08-05T17:00:00',
            assignee: 'db.architect',
            status: 'todo',
            priority: 'medium',
            tags: ['Index', 'Performance'],
            dependencies: [schemaDesignTaskId],
            sortOrder: 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: migrationTaskId,
            parentId: databaseTaskId,
            title: '🔄 資料遷移',
            description: '建立資料庫遷移和版本控制',
            startTime: '2025-08-06T09:00:00',
            endTime: '2025-08-07T17:00:00',
            assignee: 'db.architect',
            status: 'todo',
            priority: 'medium',
            tags: ['Migration', 'Version Control'],
            dependencies: [indexOptimizationTaskId],
            sortOrder: 3,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: backupStrategyTaskId,
            parentId: databaseTaskId,
            title: '💾 備份策略',
            description: '設計自動化資料備份和復原機制',
            startTime: '2025-08-07T09:00:00',
            endTime: '2025-08-08T17:00:00',
            assignee: 'db.architect',
            status: 'todo',
            priority: 'high',
            tags: ['Backup', 'Recovery'],
            dependencies: [migrationTaskId],
            sortOrder: 4,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },

          // Level 2 - Mobile detailed tasks
          {
            id: reactNativeSetupTaskId,
            parentId: mobileTaskId,
            title: '⚙️ React Native 環境',
            description: '建立跨平台開發環境和配置',
            startTime: '2025-08-10T09:00:00',
            endTime: '2025-08-12T17:00:00',
            assignee: 'mobile.dev',
            status: 'todo',
            priority: 'high',
            tags: ['React Native', 'Setup'],
            dependencies: [componentsTaskId],
            sortOrder: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: mobileUITaskId,
            parentId: mobileTaskId,
            title: '📱 行動介面',
            description: '開發適合行動裝置的使用者介面',
            startTime: '2025-08-13T09:00:00',
            endTime: '2025-08-18T17:00:00',
            assignee: 'mobile.dev',
            status: 'todo',
            priority: 'high',
            tags: ['Mobile UI', 'Responsive'],
            dependencies: [reactNativeSetupTaskId],
            sortOrder: 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: pushNotificationTaskId,
            parentId: mobileTaskId,
            title: '🔔 推播通知',
            description: '整合行動裝置推播通知功能',
            startTime: '2025-08-19T09:00:00',
            endTime: '2025-08-22T17:00:00',
            assignee: 'mobile.dev',
            status: 'todo',
            priority: 'medium',
            tags: ['Push Notification', 'FCM'],
            dependencies: [notificationTaskId],
            sortOrder: 3,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: offlineSyncTaskId,
            parentId: mobileTaskId,
            title: '🔄 離線同步',
            description: '實作離線資料同步機制',
            startTime: '2025-08-23T09:00:00',
            endTime: '2025-08-25T17:00:00',
            assignee: 'mobile.dev',
            status: 'todo',
            priority: 'medium',
            tags: ['Offline', 'Sync'],
            dependencies: [pushNotificationTaskId],
            sortOrder: 4,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },

          // Level 1 - Testing sub-tasks
          {
            id: unitTestTaskId,
            parentId: testingTaskId,
            title: '🧪 單元測試',
            description: '撰寫前後端元件單元測試',
            startTime: '2025-08-20T09:00:00',
            endTime: '2025-08-25T17:00:00',
            assignee: 'qa.engineer',
            status: 'todo',
            priority: 'high',
            tags: ['Unit Test', 'Jest'],
            dependencies: [developmentTaskId],
            sortOrder: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: integrationTestTaskId,
            parentId: testingTaskId,
            title: '🔗 整合測試',
            description: '測試系統模組間的整合功能',
            startTime: '2025-08-23T09:00:00',
            endTime: '2025-08-28T17:00:00',
            assignee: 'qa.engineer',
            status: 'todo',
            priority: 'high',
            tags: ['Integration Test', 'API'],
            dependencies: [unitTestTaskId],
            sortOrder: 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: e2eTestTaskId,
            parentId: testingTaskId,
            title: '🎯 端到端測試',
            description: '模擬真實使用者操作流程測試',
            startTime: '2025-08-26T09:00:00',
            endTime: '2025-09-02T17:00:00',
            assignee: 'qa.engineer',
            status: 'todo',
            priority: 'high',
            tags: ['E2E Test', 'Cypress'],
            dependencies: [integrationTestTaskId],
            sortOrder: 3,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: performanceTestTaskId,
            parentId: testingTaskId,
            title: '⚡ 效能測試',
            description: '進行系統負載和效能壓力測試',
            startTime: '2025-08-28T09:00:00',
            endTime: '2025-09-03T17:00:00',
            assignee: 'performance.engineer',
            status: 'todo',
            priority: 'medium',
            tags: ['Performance', 'Load Test'],
            dependencies: [integrationTestTaskId],
            sortOrder: 4,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: securityTestTaskId,
            parentId: testingTaskId,
            title: '🔒 安全性測試',
            description: '檢測系統安全漏洞和風險',
            startTime: '2025-08-30T09:00:00',
            endTime: '2025-09-04T17:00:00',
            assignee: 'security.engineer',
            status: 'todo',
            priority: 'high',
            tags: ['Security', 'Penetration Test'],
            dependencies: [integrationTestTaskId],
            sortOrder: 5,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: uatTaskId,
            parentId: testingTaskId,
            title: '👥 使用者驗收測試',
            description: '邀請使用者進行系統驗收測試',
            startTime: '2025-09-01T09:00:00',
            endTime: '2025-09-05T17:00:00',
            assignee: 'product.owner',
            status: 'todo',
            priority: 'high',
            tags: ['UAT', 'User Testing'],
            dependencies: [e2eTestTaskId],
            sortOrder: 6,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },

          // Level 2 - Unit Testing detailed tasks
          {
            id: frontendUnitTestTaskId,
            parentId: unitTestTaskId,
            title: '🖥️ 前端單元測試',
            description: '撰寫 React 元件和 Hook 測試',
            startTime: '2025-08-20T09:00:00',
            endTime: '2025-08-22T17:00:00',
            assignee: 'frontend.dev',
            status: 'todo',
            priority: 'high',
            tags: ['Frontend Test', 'React'],
            dependencies: [frontendTaskId],
            sortOrder: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: backendUnitTestTaskId,
            parentId: unitTestTaskId,
            title: '⚙️ 後端單元測試',
            description: '撰寫 API 端點和業務邏輯測試',
            startTime: '2025-08-21T09:00:00',
            endTime: '2025-08-24T17:00:00',
            assignee: 'backend.dev',
            status: 'todo',
            priority: 'high',
            tags: ['Backend Test', 'API'],
            dependencies: [backendTaskId],
            sortOrder: 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: testCoverageTaskId,
            parentId: unitTestTaskId,
            title: '📊 測試涵蓋率',
            description: '確保測試涵蓋率達到目標標準',
            startTime: '2025-08-24T09:00:00',
            endTime: '2025-08-25T17:00:00',
            assignee: 'qa.engineer',
            status: 'todo',
            priority: 'medium',
            tags: ['Coverage', 'Quality'],
            dependencies: [backendUnitTestTaskId],
            sortOrder: 3,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },

          // Level 2 - Integration Testing detailed tasks
          {
            id: apiTestTaskId,
            parentId: integrationTestTaskId,
            title: '🔌 API 整合測試',
            description: '測試前後端 API 整合功能',
            startTime: '2025-08-23T09:00:00',
            endTime: '2025-08-26T17:00:00',
            assignee: 'qa.engineer',
            status: 'todo',
            priority: 'high',
            tags: ['API Test', 'Integration'],
            dependencies: [apiIntegrationTaskId],
            sortOrder: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: dbIntegrationTestTaskId,
            parentId: integrationTestTaskId,
            title: '🗄️ 資料庫整合測試',
            description: '測試應用程式與資料庫的整合',
            startTime: '2025-08-25T09:00:00',
            endTime: '2025-08-27T17:00:00',
            assignee: 'qa.engineer',
            status: 'todo',
            priority: 'high',
            tags: ['Database Test', 'Integration'],
            dependencies: [backupStrategyTaskId],
            sortOrder: 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: thirdPartyIntegrationTestTaskId,
            parentId: integrationTestTaskId,
            title: '🔗 第三方整合測試',
            description: '測試外部服務和 API 整合',
            startTime: '2025-08-27T09:00:00',
            endTime: '2025-08-28T17:00:00',
            assignee: 'qa.engineer',
            status: 'todo',
            priority: 'medium',
            tags: ['Third Party', 'Integration'],
            dependencies: [oauthIntegrationTaskId],
            sortOrder: 3,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },

          // Level 2 - E2E Testing detailed tasks
          {
            id: userJourneyTestTaskId,
            parentId: e2eTestTaskId,
            title: '🚶 使用者旅程測試',
            description: '測試完整的使用者操作流程',
            startTime: '2025-08-26T09:00:00',
            endTime: '2025-08-29T17:00:00',
            assignee: 'qa.engineer',
            status: 'todo',
            priority: 'high',
            tags: ['User Journey', 'E2E'],
            dependencies: [userTestingTaskId],
            sortOrder: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: crossBrowserTestTaskId,
            parentId: e2eTestTaskId,
            title: '🌐 跨瀏覽器測試',
            description: '測試不同瀏覽器的相容性',
            startTime: '2025-08-30T09:00:00',
            endTime: '2025-09-01T17:00:00',
            assignee: 'qa.engineer',
            status: 'todo',
            priority: 'medium',
            tags: ['Cross Browser', 'Compatibility'],
            dependencies: [userJourneyTestTaskId],
            sortOrder: 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: mobileE2eTestTaskId,
            parentId: e2eTestTaskId,
            title: '📱 行動裝置 E2E 測試',
            description: '測試行動應用端到端功能',
            startTime: '2025-09-01T09:00:00',
            endTime: '2025-09-02T17:00:00',
            assignee: 'mobile.dev',
            status: 'todo',
            priority: 'medium',
            tags: ['Mobile E2E', 'App Test'],
            dependencies: [offlineSyncTaskId],
            sortOrder: 3,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },

          // Level 1 - Deployment sub-tasks
          {
            id: infraSetupTaskId,
            parentId: deploymentTaskId,
            title: '🏗️ 基礎設施建置',
            description: '建立生產環境基礎架構',
            startTime: '2025-09-03T09:00:00',
            endTime: '2025-09-06T17:00:00',
            assignee: 'devops.engineer',
            status: 'todo',
            priority: 'high',
            tags: ['Infrastructure', 'Cloud'],
            dependencies: [testingTaskId],
            sortOrder: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: cicdTaskId,
            parentId: deploymentTaskId,
            title: '🔄 CI/CD 流程',
            description: '建立持續整合和部署管道',
            startTime: '2025-09-04T09:00:00',
            endTime: '2025-09-07T17:00:00',
            assignee: 'devops.engineer',
            status: 'todo',
            priority: 'high',
            tags: ['CI/CD', 'Automation'],
            dependencies: [infraSetupTaskId],
            sortOrder: 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: monitoringTaskId,
            parentId: deploymentTaskId,
            title: '📊 監控系統',
            description: '建立系統監控和告警機制',
            startTime: '2025-09-06T09:00:00',
            endTime: '2025-09-08T17:00:00',
            assignee: 'devops.engineer',
            status: 'todo',
            priority: 'high',
            tags: ['Monitoring', 'Alerting'],
            dependencies: [cicdTaskId],
            sortOrder: 3,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: documentationTaskId,
            parentId: deploymentTaskId,
            title: '📚 技術文件',
            description: '撰寫部署和維運技術文件',
            startTime: '2025-09-07T09:00:00',
            endTime: '2025-09-09T17:00:00',
            assignee: 'technical.writer',
            status: 'todo',
            priority: 'medium',
            tags: ['Documentation', 'Manual'],
            dependencies: [monitoringTaskId],
            sortOrder: 4,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: trainingTaskId,
            parentId: deploymentTaskId,
            title: '👨‍🎓 使用者培訓',
            description: '進行系統使用者教育訓練',
            startTime: '2025-09-08T09:00:00',
            endTime: '2025-09-10T17:00:00',
            assignee: 'product.owner',
            status: 'todo',
            priority: 'medium',
            tags: ['Training', 'Education'],
            dependencies: [documentationTaskId],
            sortOrder: 5,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },

          // Level 2 - Infrastructure detailed tasks
          {
            id: serverSetupTaskId,
            parentId: infraSetupTaskId,
            title: '🖥️ 伺服器設定',
            description: '配置生產環境伺服器和容器',
            startTime: '2025-09-03T09:00:00',
            endTime: '2025-09-04T17:00:00',
            assignee: 'devops.engineer',
            status: 'todo',
            priority: 'high',
            tags: ['Server', 'Docker'],
            dependencies: [devOpsTaskId],
            sortOrder: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: loadBalancerTaskId,
            parentId: infraSetupTaskId,
            title: '⚖️ 負載平衡器',
            description: '設定負載平衡和高可用性架構',
            startTime: '2025-09-04T09:00:00',
            endTime: '2025-09-05T17:00:00',
            assignee: 'devops.engineer',
            status: 'todo',
            priority: 'high',
            tags: ['Load Balancer', 'HA'],
            dependencies: [serverSetupTaskId],
            sortOrder: 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: cdnSetupTaskId,
            parentId: infraSetupTaskId,
            title: '🌐 CDN 配置',
            description: '建立內容分發網路加速',
            startTime: '2025-09-05T09:00:00',
            endTime: '2025-09-06T17:00:00',
            assignee: 'devops.engineer',
            status: 'todo',
            priority: 'medium',
            tags: ['CDN', 'Performance'],
            dependencies: [loadBalancerTaskId],
            sortOrder: 3,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: sslCertTaskId,
            parentId: infraSetupTaskId,
            title: '🔒 SSL 憑證',
            description: '申請和配置 SSL 安全憑證',
            startTime: '2025-09-05T09:00:00',
            endTime: '2025-09-06T17:00:00',
            assignee: 'devops.engineer',
            status: 'todo',
            priority: 'high',
            tags: ['SSL', 'Security'],
            dependencies: [loadBalancerTaskId],
            sortOrder: 4,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },

          // Level 2 - CI/CD detailed tasks
          {
            id: buildPipelineTaskId,
            parentId: cicdTaskId,
            title: '🔨 建置流水線',
            description: '設定自動化建置和測試流程',
            startTime: '2025-09-04T09:00:00',
            endTime: '2025-09-05T17:00:00',
            assignee: 'devops.engineer',
            status: 'todo',
            priority: 'high',
            tags: ['Build', 'Pipeline'],
            dependencies: [testCoverageTaskId],
            sortOrder: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: testAutomationTaskId,
            parentId: cicdTaskId,
            title: '🤖 測試自動化',
            description: '整合自動化測試到部署流程',
            startTime: '2025-09-05T09:00:00',
            endTime: '2025-09-06T17:00:00',
            assignee: 'devops.engineer',
            status: 'todo',
            priority: 'high',
            tags: ['Test Automation', 'CI'],
            dependencies: [buildPipelineTaskId],
            sortOrder: 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: deploymentScriptTaskId,
            parentId: cicdTaskId,
            title: '📜 部署腳本',
            description: '撰寫自動化部署腳本和配置',
            startTime: '2025-09-06T09:00:00',
            endTime: '2025-09-07T17:00:00',
            assignee: 'devops.engineer',
            status: 'todo',
            priority: 'high',
            tags: ['Deployment', 'Script'],
            dependencies: [testAutomationTaskId],
            sortOrder: 3,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: rollbackStrategyTaskId,
            parentId: cicdTaskId,
            title: '↩️ 回滾策略',
            description: '建立部署失敗時的回滾機制',
            startTime: '2025-09-06T09:00:00',
            endTime: '2025-09-07T17:00:00',
            assignee: 'devops.engineer',
            status: 'todo',
            priority: 'medium',
            tags: ['Rollback', 'Recovery'],
            dependencies: [deploymentScriptTaskId],
            sortOrder: 4,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },

          // Level 2 - Monitoring detailed tasks
          {
            id: logsMonitoringTaskId,
            parentId: monitoringTaskId,
            title: '📋 日誌監控',
            description: '建立系統日誌收集和分析',
            startTime: '2025-09-06T09:00:00',
            endTime: '2025-09-07T17:00:00',
            assignee: 'devops.engineer',
            status: 'todo',
            priority: 'high',
            tags: ['Logs', 'ELK'],
            dependencies: [loggingTaskId],
            sortOrder: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: metricsTaskId,
            parentId: monitoringTaskId,
            title: '📈 效能指標',
            description: '建立系統效能監控指標',
            startTime: '2025-09-07T09:00:00',
            endTime: '2025-09-08T17:00:00',
            assignee: 'devops.engineer',
            status: 'todo',
            priority: 'high',
            tags: ['Metrics', 'Prometheus'],
            dependencies: [logsMonitoringTaskId],
            sortOrder: 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: alertingTaskId,
            parentId: monitoringTaskId,
            title: '🚨 告警系統',
            description: '設定系統異常告警通知',
            startTime: '2025-09-07T09:00:00',
            endTime: '2025-09-08T17:00:00',
            assignee: 'devops.engineer',
            status: 'todo',
            priority: 'high',
            tags: ['Alerting', 'Notification'],
            dependencies: [metricsTaskId],
            sortOrder: 3,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: dashboardSetupTaskId,
            parentId: monitoringTaskId,
            title: '📊 監控儀表板',
            description: '建立視覺化監控儀表板',
            startTime: '2025-09-08T09:00:00',
            endTime: '2025-09-08T17:00:00',
            assignee: 'devops.engineer',
            status: 'todo',
            priority: 'medium',
            tags: ['Dashboard', 'Grafana'],
            dependencies: [alertingTaskId],
            sortOrder: 4,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },

          // Level 3 - Additional Auth API granular tasks
          {
            id: passwordEncryptionTaskId,
            parentId: authApiTaskId,
            title: '🔐 密碼加密',
            description: '實作安全的密碼加密和驗證',
            startTime: '2025-08-05T09:00:00',
            endTime: '2025-08-06T17:00:00',
            assignee: 'backend.dev',
            status: 'todo',
            priority: 'high',
            tags: ['Password', 'Encryption'],
            dependencies: [jwtTaskId],
            sortOrder: 3,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: sessionManagementTaskId,
            parentId: authApiTaskId,
            title: '🎫 會話管理',
            description: '實作使用者會話狀態管理',
            startTime: '2025-08-07T09:00:00',
            endTime: '2025-08-08T17:00:00',
            assignee: 'backend.dev',
            status: 'todo',
            priority: 'medium',
            tags: ['Session', 'State'],
            dependencies: [passwordEncryptionTaskId],
            sortOrder: 4,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: oauthIntegrationTaskId,
            parentId: authApiTaskId,
            title: '🔗 OAuth 整合',
            description: '整合第三方 OAuth 登入服務',
            startTime: '2025-08-08T09:00:00',
            endTime: '2025-08-08T17:00:00',
            assignee: 'backend.dev',
            status: 'todo',
            priority: 'medium',
            tags: ['OAuth', 'Third Party'],
            dependencies: [validationTaskId],
            sortOrder: 5,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },

          // Level 3 - User API granular tasks
          {
            id: profileManagementTaskId,
            parentId: userApiTaskId,
            title: '👤 個人檔案管理',
            description: '實作使用者個人資料管理功能',
            startTime: '2025-08-09T09:00:00',
            endTime: '2025-08-11T17:00:00',
            assignee: 'backend.dev',
            status: 'todo',
            priority: 'medium',
            tags: ['Profile', 'User Data'],
            dependencies: [authApiTaskId],
            sortOrder: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: permissionSystemTaskId,
            parentId: userApiTaskId,
            title: '🔑 權限系統',
            description: '實作角色權限控制系統',
            startTime: '2025-08-12T09:00:00',
            endTime: '2025-08-14T17:00:00',
            assignee: 'backend.dev',
            status: 'todo',
            priority: 'high',
            tags: ['Permission', 'RBAC'],
            dependencies: [profileManagementTaskId],
            sortOrder: 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: userPreferencesTaskId,
            parentId: userApiTaskId,
            title: '⚙️ 使用者偏好',
            description: '實作使用者個人化設定功能',
            startTime: '2025-08-14T09:00:00',
            endTime: '2025-08-15T17:00:00',
            assignee: 'backend.dev',
            status: 'todo',
            priority: 'low',
            tags: ['Preferences', 'Settings'],
            dependencies: [permissionSystemTaskId],
            sortOrder: 3,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },

          // Level 3 - Data API granular tasks
          {
            id: dataValidationTaskId,
            parentId: dataApiTaskId,
            title: '✅ 資料驗證',
            description: '實作業務資料驗證規則',
            startTime: '2025-08-12T09:00:00',
            endTime: '2025-08-14T17:00:00',
            assignee: 'backend.dev',
            status: 'todo',
            priority: 'high',
            tags: ['Data Validation', 'Business Rules'],
            dependencies: [userApiTaskId],
            sortOrder: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: cacheImplementationTaskId,
            parentId: dataApiTaskId,
            title: '⚡ 快取實作',
            description: '實作資料快取機制提升效能',
            startTime: '2025-08-15T09:00:00',
            endTime: '2025-08-17T17:00:00',
            assignee: 'backend.dev',
            status: 'todo',
            priority: 'medium',
            tags: ['Cache', 'Redis'],
            dependencies: [dataValidationTaskId],
            sortOrder: 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: searchFunctionalityTaskId,
            parentId: dataApiTaskId,
            title: '🔍 搜尋功能',
            description: '實作全文搜尋和篩選功能',
            startTime: '2025-08-18T09:00:00',
            endTime: '2025-08-19T17:00:00',
            assignee: 'backend.dev',
            status: 'todo',
            priority: 'medium',
            tags: ['Search', 'ElasticSearch'],
            dependencies: [cacheImplementationTaskId],
            sortOrder: 3,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: reportGenerationTaskId,
            parentId: dataApiTaskId,
            title: '📊 報表生成',
            description: '實作資料報表生成和匯出功能',
            startTime: '2025-08-19T09:00:00',
            endTime: '2025-08-20T17:00:00',
            assignee: 'backend.dev',
            status: 'todo',
            priority: 'low',
            tags: ['Report', 'Export'],
            dependencies: [searchFunctionalityTaskId],
            sortOrder: 4,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
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
    },
  },

  // Install persistence plugin
  plugins: [persistencePlugin],
})
