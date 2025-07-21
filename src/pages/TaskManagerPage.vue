<template>
  <q-page class="task-manager-page">
    <!-- Header with view toggle and actions -->
    <div class="page-header q-pa-xs">
      <div class="row items-center justify-between">
        <div class="col-auto">
          <h4 class="q-ma-none">任務管理系統</h4>
        </div>

        <div class="col-auto">
          <div class="row q-gutter-xs items-center">
            <!-- View Toggle -->
            <q-btn-toggle
              v-model="currentView"
              toggle-color="primary"
              :options="[
                { label: '列表檢視', value: 'list', icon: 'list' },
                { label: '甘特圖', value: 'gantt', icon: 'timeline' }
              ]"
              size="sm"
              no-caps
            />

            <!-- Actions -->
            <q-btn
              color="primary"
              icon="add"
              size="sm"
              label="新增任務"
              @click="showAddTask"
            />

            <q-btn
              color="secondary"
              icon="refresh"
              size="sm"
              label="重新整理"
              @click="refreshData"
            />

            <q-btn
              color="orange"
              icon="restore"
              size="sm"
              label="重置範例"
              @click="resetSampleData"
            />

            <!-- Export Options -->
            <q-btn-dropdown
              color="grey-7"
              icon="download"
              size="sm"
              label="匯出"
              auto-close
            >
              <q-list>
                <q-item clickable @click="exportTasks('json')">
                  <q-item-section avatar>
                    <q-icon name="code" />
                  </q-item-section>
                  <q-item-section>JSON 格式</q-item-section>
                </q-item>

                <q-item clickable @click="exportTasks('csv')">
                  <q-item-section avatar>
                    <q-icon name="table_chart" />
                  </q-item-section>
                  <q-item-section>CSV 格式</q-item-section>
                </q-item>

                <q-item
                  v-if="currentView === 'gantt'"
                  clickable
                  @click="exportGantt('pdf')"
                >
                  <q-item-section avatar>
                    <q-icon name="picture_as_pdf" />
                  </q-item-section>
                  <q-item-section>甘特圖 PDF</q-item-section>
                </q-item>
              </q-list>
            </q-btn-dropdown>
          </div>
        </div>
      </div>
    </div>

    <!-- Filter Bar (sticky) -->
    <div class="filter-bar-sticky">
      <FilterBar
        @filter-change="onFilterChange"
        class="q-mx-xs q-mb-xs"
      />
    </div>

    <!-- Main Content Area -->
    <div class="main-content q-pa-xs">
      <!-- List View -->
      <div v-show="currentView === 'list'" class="list-view">
        <!-- List Controls (Fixed) -->
        <div v-if="displayTasks.length > 0" class="list-controls q-pa-xs bg-grey-1 row justify-between items-center">
          <div class="row q-gutter-xs">
            <q-btn
              flat
              dense
              size="xs"
              icon="unfold_more"
              :label="$q.screen.xs ? '' : '全部展開'"
              color="primary"
              @click="expandAllTasks"
            >
              <q-tooltip v-if="$q.screen.xs">全部展開</q-tooltip>
            </q-btn>
            <q-btn
              flat
              dense
              size="xs"
              icon="unfold_less"
              :label="$q.screen.xs ? '' : '全部縮合'"
              color="primary"
              @click="collapseAllTasks"
            >
              <q-tooltip v-if="$q.screen.xs">全部縮合</q-tooltip>
            </q-btn>
          </div>
          <div class="text-body2 text-grey-8">
            任務清單 ({{ taskStats.total }} 個任務)
          </div>
        </div>

        <!-- Scrollable Task Content -->
        <div class="task-content-area">
          <div v-if="displayTasks.length === 0" class="empty-state text-center q-pa-md">
            <q-icon name="assignment" size="4rem" color="grey-4" />
            <div class="text-h6 text-grey-6 q-mt-md">
              {{ hasFilters ? '沒有符合篩選條件的任務' : '尚無任務' }}
            </div>
            <div class="text-body2 text-grey-6 q-mt-sm">
              {{ hasFilters ? '請調整篩選條件或' : '' }}點擊上方「新增任務」按鈕開始建立任務
            </div>
          </div>

          <TaskList
            v-else
            ref="taskListRef"
            :tasks="displayTasks"
            @edit-task="editTask"
            @delete-task="deleteTask"
            @status-change="updateTaskStatus"
            @add-subtask="addSubtask"
            @duplicate-task="duplicateTask"
          />
        </div>
      </div>

      <!-- Gantt View -->
      <div v-show="currentView === 'gantt'" class="gantt-view">
        <GanttView
          ref="ganttRef"
          @task-updated="onGanttTaskUpdated"
          @task-edit="editTask"
        />
      </div>
    </div>

    <!-- Task Edit Dialog -->
    <TaskEditDialog
      v-model="showEditDialog"
      :task-id="editingTaskId"
      :parent-id="editingParentId"
      @task-saved="onTaskSaved"
      @task-deleted="onTaskDeleted"
    />

    <!-- Floating Action Button for Mobile -->
    <q-page-sticky position="bottom-right" :offset="[18, 18]" class="mobile-only">
      <q-btn
        fab
        icon="add"
        color="primary"
        @click="showAddTask"
      />
    </q-page-sticky>
  </q-page>
</template>

<script>
import { ref, computed, onMounted, watch } from 'vue'
import { useTaskStore } from 'src/stores/taskStore'
import { useQuasar } from 'quasar'
import TaskList from 'src/components/TaskList.vue'
import GanttView from 'src/components/GanttView.vue'
import TaskEditDialog from 'src/components/TaskEditDialog.vue'
import FilterBar from 'src/components/FilterBar.vue'

export default {
  name: 'TaskManagerPage',

  components: {
    TaskList,
    GanttView,
    TaskEditDialog,
    FilterBar
  },

  setup() {
    const taskStore = useTaskStore()
    const $q = useQuasar()

    // Refs
    const ganttRef = ref(null)
    const taskListRef = ref(null)
    const showEditDialog = ref(false)
    const editingTaskId = ref(null)
    const editingParentId = ref(null)
    const searchText = ref('')

    // Current view from store
    const currentView = computed({
      get: () => taskStore.currentView,
      set: (val) => taskStore.setCurrentView(val)
    })

    // Display tasks based on filters and search
    const displayTasks = computed(() => {
      let tasks = taskStore.taskTree

      // Apply search filter
      if (searchText.value) {
        tasks = filterTasksRecursive(tasks, (task) =>
          task.title.toLowerCase().includes(searchText.value.toLowerCase()) ||
          task.description.toLowerCase().includes(searchText.value.toLowerCase())
        )
      }

      // Apply other filters
      if (hasAnyFilters.value) {
        tasks = filterTasksRecursive(tasks, (task) => {
          return matchesFilters(task)
        })
      }

      return tasks
    })

    // Check if there are active filters
    const hasFilters = computed(() => {
      return hasAnyFilters.value || searchText.value
    })

    const hasAnyFilters = computed(() => {
      const filters = taskStore.filters
      return filters.status ||
             filters.priority ||
             (filters.tags && filters.tags.length > 0) ||
             filters.assignee ||
             filters.dateRange
    })

    // Task statistics
    const taskStats = computed(() => {
      const allTasks = taskStore.tasks
      return {
        total: allTasks.length,
        completed: allTasks.filter(t => t.status === 'done').length,
        inProgress: allTasks.filter(t => t.status === 'in_progress').length,
        todo: allTasks.filter(t => t.status === 'todo').length,
        blocked: allTasks.filter(t => t.status === 'blocked').length
      }
    })

    // Methods
    const filterTasksRecursive = (tasks, predicate) => {
      return tasks.reduce((acc, task) => {
        const matchesFilter = predicate(task)
        const filteredChildren = task.children ? filterTasksRecursive(task.children, predicate) : []

        // Include task if it matches or has matching children
        if (matchesFilter || filteredChildren.length > 0) {
          acc.push({
            ...task,
            children: filteredChildren
          })
        }

        return acc
      }, [])
    }

    const matchesFilters = (task) => {
      const filters = taskStore.filters

      if (filters.status && task.status !== filters.status) return false
      if (filters.priority && task.priority !== filters.priority) return false
      if (filters.tags && filters.tags.length > 0 &&
          !task.tags.some(tag => filters.tags.includes(tag))) return false
      if (filters.assignee &&
          !task.assignee.toLowerCase().includes(filters.assignee.toLowerCase())) return false

      if (filters.dateRange) {
        const { start, end } = filters.dateRange
        if (!task.startTime) return false
        const taskDate = new Date(task.startTime)
        if (taskDate < new Date(start) || taskDate > new Date(end)) return false
      }

      return true
    }

    // Task management methods
    const showAddTask = () => {
      editingTaskId.value = null
      editingParentId.value = null
      showEditDialog.value = true
    }

    const editTask = (taskId) => {
      editingTaskId.value = taskId
      editingParentId.value = null
      showEditDialog.value = true
    }

    const addSubtask = (parentId) => {
      editingTaskId.value = null
      editingParentId.value = parentId
      showEditDialog.value = true
    }

    const deleteTask = (taskId) => {
      taskStore.deleteTask(taskId)
      $q.notify({
        message: '任務已刪除',
        color: 'info',
        icon: 'delete'
      })
    }

    const updateTaskStatus = ({ taskId, status }) => {
      taskStore.updateTask(taskId, { status })
      $q.notify({
        message: '任務狀態已更新',
        color: 'positive',
        icon: 'check_circle'
      })
    }

    // Expand/Collapse controls
    const expandAllTasks = () => {
      taskStore.expandAllTasks()
      $q.notify({
        message: '已展開所有任務',
        color: 'info',
        icon: 'unfold_more'
      })
    }

    const collapseAllTasks = () => {
      taskStore.collapseAllTasks()
      $q.notify({
        message: '已縮合所有任務',
        color: 'info',
        icon: 'unfold_less'
      })
    }

    const duplicateTask = (taskId) => {
      const duplicatedTask = taskStore.duplicateTask(taskId)
      if (duplicatedTask) {
        $q.notify({
          message: '任務已複製',
          color: 'positive',
          icon: 'content_copy'
        })
      }
    }

    // Event handlers
    const onFilterChange = ({ searchText: search }) => {
      searchText.value = search || ''
    }

    const onTaskSaved = () => {
      $q.notify({
        message: '任務已儲存',
        color: 'positive',
        icon: 'save'
      })

      // Refresh gantt if in gantt view
      if (currentView.value === 'gantt' && ganttRef.value) {
        ganttRef.value.refreshGantt()
      }
    }

    const onTaskDeleted = () => {
      $q.notify({
        message: '任務已刪除',
        color: 'info',
        icon: 'delete'
      })
    }

    const onGanttTaskUpdated = (taskId, ganttTask) => {
      // Update task from gantt changes
      const updates = {
        title: ganttTask.text,
        startTime: ganttTask.start_date ? new Date(ganttTask.start_date).toISOString() : null,
        endTime: ganttTask.end_date ? new Date(ganttTask.end_date).toISOString() : null
      }

      taskStore.updateTask(taskId, updates)
    }

    // Utility methods
    const refreshData = () => {
      if (currentView.value === 'gantt' && ganttRef.value) {
        ganttRef.value.refreshGantt()
      }

      $q.notify({
        message: '資料已重新整理',
        color: 'info',
        icon: 'refresh'
      })
    }

    const resetSampleData = () => {
      $q.dialog({
        title: '重置範例資料',
        message: '確定要重置為新的多階層範例資料嗎？現有資料將被清除。',
        cancel: true,
        persistent: true
      }).onOk(() => {
        taskStore.resetSampleData()

        // Refresh gantt if in gantt view
        if (currentView.value === 'gantt' && ganttRef.value) {
          setTimeout(() => {
            ganttRef.value.refreshGantt()
          }, 100)
        }

        $q.notify({
          message: '已重置為多階層範例資料',
          color: 'positive',
          icon: 'restore'
        })
      })
    }

    const exportTasks = (format) => {
      try {
        const tasks = taskStore.tasks
        let content = ''
        let filename = ''

        if (format === 'json') {
          content = JSON.stringify(tasks, null, 2)
          filename = 'tasks.json'
        } else if (format === 'csv') {
          const headers = ['ID', '標題', '描述', '狀態', '優先級', '執行人', '開始時間', '結束時間', '標籤']
          const csvData = [
            headers.join(','),
            ...tasks.map(task => [
              task.id,
              `"${task.title}"`,
              `"${task.description}"`,
              task.status,
              task.priority,
              task.assignee,
              task.startTime || '',
              task.endTime || '',
              `"${task.tags.join(', ')}"`
            ].join(','))
          ]
          content = csvData.join('\n')
          filename = 'tasks.csv'
        }

        // Create and download file
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)

        $q.notify({
          message: `已匯出 ${filename}`,
          color: 'positive',
          icon: 'download'
        })
      } catch (error) {
        $q.notify({
          message: '匯出失敗：' + error.message,
          color: 'negative',
          icon: 'error'
        })
      }
    }

    const exportGantt = (format) => {
      if (ganttRef.value) {
        if (format === 'pdf') {
          ganttRef.value.exportToPDF()
        } else if (format === 'png') {
          ganttRef.value.exportToPNG()
        }
      }
    }

    // Lifecycle
    onMounted(() => {
      // Initialize sample data if no tasks exist
      taskStore.initializeSampleData()
    })

    // Watch for view changes to refresh gantt
    watch(currentView, (newView) => {
      if (newView === 'gantt') {
        // Give gantt component time to mount
        setTimeout(() => {
          if (ganttRef.value) {
            ganttRef.value.refreshGantt()
          }
        }, 100)
      }
    })

    // Watch for create task trigger from sidebar
    watch(() => taskStore.showCreateTaskDialog, (shouldShow) => {
      if (shouldShow) {
        showAddTask()
        taskStore.resetCreateTaskDialog()
      }
    })

    return {
      // Refs
      ganttRef,
      taskListRef,
      showEditDialog,
      editingTaskId,
      editingParentId,
      searchText,

      // Computed
      currentView,
      displayTasks,
      hasFilters,
      taskStats,

      // Methods
      showAddTask,
      editTask,
      addSubtask,
      deleteTask,
      duplicateTask,
      updateTaskStatus,
      expandAllTasks,
      collapseAllTasks,
      onFilterChange,
      onTaskSaved,
      onTaskDeleted,
      onGanttTaskUpdated,
      refreshData,
      resetSampleData,
      exportTasks,
      exportGantt
    }
  }
}
</script>

<style scoped>
.task-manager-page {
  min-height: 100vh;
  background: #f5f5f5;
}

.page-header {
  background: white;
  border-bottom: 1px solid #e0e0e0;
  position: sticky;
  top: 0;
  z-index: 20;
}

/* Filter bar sticky */
.filter-bar-sticky {
  position: sticky;
  top: 56px; /* header高度，視實際情況微調 */
  z-index: 15;
  background: white;
}

.page-header h4 {
  font-size: 18px;
  margin: 4px 0;
}

.main-content {
  height: calc(100vh - 200px); /* header+filter bar高度 */
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.list-view {
  background: white;
  border-radius: 6px;
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.list-controls {
  border-bottom: 1px solid #e0e0e0;
  border-radius: 6px 6px 0 0;
  min-height: 36px;
  flex-shrink: 0; /* 防止縮小 */
}

.task-content-area {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.gantt-view {
  background: white;
  border-radius: 6px;
  flex: 1;
  height: 100%;
  min-height: 400px;
}

.empty-state {
  min-height: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.empty-state .q-icon {
  font-size: 3rem !important;
}

.empty-state .text-h6 {
  font-size: 16px;
  margin-top: 8px;
}

.empty-state .text-body2 {
  font-size: 13px;
  margin-top: 4px;
}

/* Compact button styling */
.page-header .q-btn {
  font-size: 12px;
  padding: 4px 8px;
  min-height: 32px;
}

.page-header .q-btn-toggle {
  font-size: 11px;
}

.page-header .q-btn-toggle .q-btn {
  padding: 4px 12px;
  min-height: 32px;
}

/* Mobile specific styles */
@media (max-width: 768px) {
  .page-header .row {
    flex-direction: column;
    gap: 8px;
  }

  .page-header .col-auto {
    width: 100%;
  }

  .q-btn-toggle {
    width: 100%;
  }

  .list-controls {
    flex-direction: column;
    gap: 6px;
    align-items: flex-start !important;
  }

  .list-controls .row {
    align-self: flex-end;
  }

  .mobile-only {
    display: block;
  }

  .page-header h4 {
    font-size: 16px;
    margin: 2px 0;
  }
  .filter-bar-sticky {
    top: 48px;
  }
  .main-content {
    height: calc(100vh - 100px);
  }
}

@media (min-width: 769px) {
  .mobile-only {
    display: none;
  }
}
</style>
