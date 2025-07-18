<template>
  <div
    class="task-item-compact"
    :class="[
      `task-level-${level}`,
      `task-status-${task.status}`,
      `task-priority-${task.priority}`,
      { 'has-children': hasChildren, 'expanded': isExpanded, 'drop-target': hasChildren }
    ]"
    :data-task-id="task.id"
    @dragover.prevent="onDragOver"
    @dragenter.prevent="onDragEnter"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- Drag Handle -->
    <q-icon
      name="drag_indicator"
      class="drag-handle"
      size="xs"
    />

    <!-- Select Checkbox -->
    <q-checkbox
      :model-value="isSelected"
      @update:model-value="toggleSelection"
      class="select-checkbox"
      size="sm"
    />

    <!-- Single compact row (only縮排內容) -->
    <div class="task-row-compact" :style="dynamicIndentStyle">
      <!-- Expand/collapse button (always visible) -->
      <q-btn
        :icon="getExpandButtonIcon"
        flat
        dense
        size="xs"
        class="expand-btn-compact"
        :class="{ 'add-subtask-btn': !hasChildren }"
        @click.stop="handleExpandClick"
      >
        <q-tooltip>{{ getExpandButtonTooltip }}</q-tooltip>
      </q-btn>

      <!-- Status indicator -->
      <div class="status-indicator-compact" @click="cycleStatus">
        <q-icon
          v-if="task.status === 'in_progress'"
          name="play_circle"
          color="primary"
          size="16px"
          class="status-icon"
        />
        <q-icon
          v-else-if="task.status === 'done'"
          name="check_circle"
          color="positive"
          size="16px"
          class="status-icon animate-scale"
        />
        <q-icon
          v-else-if="task.status === 'blocked'"
          name="lock"
          color="negative"
          size="16px"
          class="status-icon"
        />
        <q-icon
          v-else
          name="radio_button_unchecked"
          color="grey-6"
          size="16px"
          class="status-icon"
        />
      </div>

      <!-- Priority badge -->
      <div class="priority-badge" :class="`priority-${task.priority}`">
        {{ priorityText }}
      </div>

      <!-- Task title (clickable) -->
      <div
        class="task-title-compact"
        @click="$emit('edit', task.id)"
        :class="{ 'has-children-title': hasChildren }"
      >
        {{ task.title }}
      </div>

      <!-- Hover Action Buttons -->
      <div class="hover-actions">
        <q-btn
          flat
          dense
          size="xs"
          icon="edit"
          class="action-btn"
          @click="$emit('edit', task.id)"
        >
          <q-tooltip>編輯任務</q-tooltip>
        </q-btn>
        <q-btn
          flat
          dense
          size="xs"
          icon="add"
          class="action-btn"
          @click="$emit('add-subtask', task.id)"
        >
          <q-tooltip>新增子任務</q-tooltip>
        </q-btn>
        <q-btn
          flat
          dense
          size="xs"
          icon="content_copy"
          class="action-btn"
          @click="duplicateTask"
        >
          <q-tooltip>複製任務</q-tooltip>
        </q-btn>
        <q-btn
          flat
          dense
          size="xs"
          icon="delete"
          class="action-btn delete-btn"
          @click="confirmDelete"
        >
          <q-tooltip>刪除任務</q-tooltip>
        </q-btn>
      </div>

      <!-- Task meta info in single line -->
      <div class="task-meta-compact">
        <!-- Tags -->
        <span v-if="task.tags.length > 0" class="meta-tags">
          <q-icon name="label" size="xs" />
          {{ task.tags.slice(0, 2).join(', ') }}
          <span v-if="task.tags.length > 2">+{{ task.tags.length - 2 }}</span>
        </span>
        <!-- Assignee -->
        <span v-if="task.assignee" class="meta-assignee">
          <q-icon name="person" size="xs" />
          {{ task.assignee }}
        </span>
        <!-- Date -->
        <span v-if="task.startTime" class="meta-date">
          <q-icon name="schedule" size="xs" />
          {{ formatDate(task.startTime) }}
        </span>
        <!-- Dependencies warning -->
        <span v-if="dependencyInfo" class="meta-warning">
          <q-icon name="link" size="xs" color="warning" />
        </span>
      </div>
    </div>
  </div>
</template>

<script>
import { computed } from 'vue'
import { useTaskStore } from 'src/stores/taskStore'
import { useQuasar } from 'quasar'

export default {
  name: 'TaskItem',

  props: {
    task: {
      type: Object,
      required: true
    },
    level: {
      type: Number,
      default: 0
    },
    selectedTasks: {
      type: Array,
      default: () => []
    }
  },

  emits: ['edit', 'delete', 'status-change', 'add-subtask', 'toggle-expand', 'duplicate', 'toggle-selection'],

  setup(props, { emit }) {
    const taskStore = useTaskStore()
    const $q = useQuasar()

    // Computed properties
    const hasChildren = computed(() => {
      return props.task.children && props.task.children.length > 0
    })

    const isExpanded = computed(() => {
      return taskStore.isTaskExpanded(props.task.id)
    })

    const priorityColor = computed(() => {
      const colors = {
        low: 'grey-6',
        medium: 'orange',
        high: 'red'
      }
      return colors[props.task.priority] || 'grey-6'
    })

    const priorityText = computed(() => {
      const texts = {
        low: '低',
        medium: '中',
        high: '高'
      }
      return texts[props.task.priority] || '中'
    })


    const dependencyInfo = computed(() => {
      if (!props.task.dependencies || props.task.dependencies.length === 0) {
        return null
      }

      const incompleteDeps = props.task.dependencies.filter(depId => {
        const depTask = taskStore.getTaskById(depId)
        return depTask && depTask.status !== 'done'
      })

      if (incompleteDeps.length > 0) {
        return `等待 ${incompleteDeps.length} 個依賴任務`
      }

      return null
    })

    const isSelected = computed(() => {
      return props.selectedTasks.includes(props.task.id)
    })

    // Dynamic indentation style based on level
    const dynamicIndentStyle = computed(() => {
      const baseIndent = 10
      const extraIndent = (props.level - 0) * 24
      const totalIndent = baseIndent + extraIndent

      return {
        paddingLeft: `${totalIndent}px`,
        background: `${Math.min(totalIndent + 24, 240)}px)`
      }
    })

    // Get expand button icon based on task state
    const getExpandButtonIcon = computed(() => {
      if (hasChildren.value) {
        return taskStore.isTaskExpanded(props.task.id) ? 'expand_less' : 'expand_more'
      } else {
        return 'add'
      }
    })

    // Get expand button tooltip text
    const getExpandButtonTooltip = computed(() => {
      if (hasChildren.value) {
        return taskStore.isTaskExpanded(props.task.id) ? '縮合子任務' : '展開子任務'
      } else {
        return '新增子任務'
      }
    })

    // Methods
    const toggleExpand = (event) => {
      // Prevent event bubbling to avoid conflicts
      if (event) {
        event.stopPropagation()
        event.preventDefault()
      }
      // 只 emit，不直接操作 store
      emit('toggle-expand', props.task.id)
    }

    // Handle expand button click (expand/collapse or add subtask)
    const handleExpandClick = (event) => {
      if (event) {
        event.stopPropagation()
        event.preventDefault()
      }
      
      if (hasChildren.value) {
        // If task has children, toggle expand/collapse
        emit('toggle-expand', props.task.id)
      } else {
        // If task has no children, add subtask
        emit('add-subtask', props.task.id)
      }
    }

    const cycleStatus = () => {
      const statusCycle = ['todo', 'in_progress', 'done']
      const currentIndex = statusCycle.indexOf(props.task.status)
      const nextIndex = (currentIndex + 1) % statusCycle.length
      const newStatus = statusCycle[nextIndex]

      // Check if can mark as done
      if (newStatus === 'done' && !taskStore.canMarkAsDone(props.task.id)) {
        $q.notify({
          message: '無法標記為完成：仍有未完成的依賴任務',
          color: 'warning',
          icon: 'warning'
        })
        return
      }

      emit('status-change', { taskId: props.task.id, status: newStatus })
    }

    const confirmDelete = () => {
      $q.dialog({
        title: '確認刪除',
        message: `確定要刪除任務「${props.task.title}」嗎？${hasChildren.value ? '這將同時刪除所有子任務。' : ''}`,
        cancel: true,
        persistent: true
      }).onOk(() => {
        emit('delete', props.task.id)
      })
    }

    const duplicateTask = () => {
      emit('duplicate', props.task.id)
    }

    const toggleSelection = (selected) => {
      emit('toggle-selection', { taskId: props.task.id, selected })
    }

    const expandThisLevel = () => {
      taskStore.expandTaskLevel(props.task.id)
    }

    const collapseThisLevel = () => {
      taskStore.collapseTaskLevel(props.task.id)
    }

    const formatDate = (dateString) => {
      if (!dateString) return ''

      const date = new Date(dateString)
      return date.toLocaleDateString('zh-TW', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    }

    // Drag and drop event handlers
    const onDragOver = (event) => {
      if (!hasChildren.value) return
      event.preventDefault()
    }

    const onDragEnter = (event) => {
      if (!hasChildren.value) return
      event.preventDefault()
      event.target.closest('.task-item-compact').classList.add('drag-over')
    }

    const onDragLeave = (event) => {
      if (!hasChildren.value) return
      event.target.closest('.task-item-compact').classList.remove('drag-over')
    }

    const onDrop = (event) => {
      if (!hasChildren.value) return
      event.preventDefault()
      event.target.closest('.task-item-compact').classList.remove('drag-over')

      // Get the dragged task ID from the drag data
      const draggedTaskId = event.dataTransfer?.getData('text/plain')
      if (draggedTaskId && draggedTaskId !== props.task.id) {

        // Move the dragged task to become a child of this task
        taskStore.updateTaskOrder(draggedTaskId, props.task.id, 0)

        // Auto-expand the target task to show the new child
        if (!taskStore.isTaskExpanded(props.task.id)) {
          taskStore.toggleTaskExpansion(props.task.id)
        }
      }
    }

    return {
      taskStore,
      hasChildren,
      isExpanded,
      priorityColor,
      priorityText,
      dependencyInfo,
      isSelected,
      dynamicIndentStyle,
      getExpandButtonIcon,
      getExpandButtonTooltip,
      toggleExpand,
      handleExpandClick,
      cycleStatus,
      confirmDelete,
      duplicateTask,
      toggleSelection,
      expandThisLevel,
      collapseThisLevel,
      formatDate,
      onDragOver,
      onDragEnter,
      onDragLeave,
      onDrop
    }
  }
}
</script>

<style scoped>
/* Compact task item layout */
.task-item-compact {
  border-bottom: 1px solid #f0f0f0;
  background: white;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  margin-bottom: 1px;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
}

.task-item-compact::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
  transition: left 0.5s ease;
}

.task-item-compact:hover {
  background: #fafafa;
  border-color: #d0d0d0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  transform: translateY(-1px);
}

.task-item-compact:hover::before {
  left: 100%;
}

.task-row-compact {
  display: flex;
  align-items: center;
  padding: 2px 2px;
  gap: 2px;
  min-height: 24px;
  flex-wrap: nowrap;
  min-width: 0;
  width: 100%;
}

/* Dynamic indentation for levels beyond 4 */
.task-item-compact[class*="task-level-"] .task-row-compact {
  transition: all 0.2s ease;
}

/* Drag handle */
.drag-handle {
  cursor: grab;
  color: #999;
  transition: color 0.2s ease;
  font-size: 12px;
  width: 14px;
  height: 14px;
  padding: 0;
  margin-right: 1px;
}

.drag-handle:hover {
  color: #555;
}

.drag-handle:active {
  cursor: grabbing;
  color: #333;
}

/* Select checkbox */
.select-checkbox {
  margin: 0;
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 更小的 checkbox 圖示 */
.select-checkbox .q-checkbox__bg {
  width: 12px;
  height: 12px;
  min-width: 12px;
  min-height: 12px;
}

.select-checkbox:hover .q-checkbox__bg {
  background: rgba(25, 118, 210, 0.05);
  border-color: #1976d2;
}

/* Expand button */
.expand-btn-compact {
  min-width: 16px !important;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  transition: all 0.2s ease;
  background: rgba(25, 118, 210, 0.05);
  border: 1px solid rgba(25, 118, 210, 0.1);
}

.expand-btn-compact:hover {
  background: rgba(25, 118, 210, 0.1);
  border-color: rgba(25, 118, 210, 0.3);
  transform: scale(1.1);
}

/* Add subtask button styling */
.add-subtask-btn {
  background: rgba(76, 175, 80, 0.05);
  border: 1px solid rgba(76, 175, 80, 0.1);
  color: #4caf50;
}

.add-subtask-btn:hover {
  background: rgba(76, 175, 80, 0.1);
  border-color: rgba(76, 175, 80, 0.3);
  color: #388e3c;
  transform: scale(1.1);
}

/* Status indicator */
.status-indicator-compact {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  transition: all 0.2s ease;
}

.status-indicator-compact:hover {
  background: rgba(0,0,0,0.05);
  transform: scale(1.1);
}

.animate-scale {
  animation: scaleIn 0.3s ease-out;
}

@keyframes scaleIn {
  from { transform: scale(0.5); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

/* Priority badge */
.priority-badge {
  font-size: 8px;
  font-weight: 600;
  padding: 1px 3px;
  border-radius: 4px;
  min-width: 16px;
  text-align: center;
  text-transform: uppercase;
  transition: all 0.2s ease;
  cursor: default;
}

.task-item-compact:hover .priority-badge {
  transform: scale(1.05);
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.priority-high {
  background: #ffebee;
  color: #c62828;
}

.priority-medium {
  background: #fff3e0;
  color: #ef6c00;
}

.priority-low {
  background: #f3e5f5;
  color: #7b1fa2;
}

/* Task title */
.task-title-compact {
  font-weight: 500;
  cursor: pointer;
  flex: 1;
  min-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
  transition: all 0.2s ease;
  position: relative;
  padding: 2px 4px;
  border-radius: 4px;
}

.task-title-compact:hover {
  color: #1976d2;
  background: rgba(25, 118, 210, 0.05);
  transform: translateX(2px);
}

.has-children-title {
  cursor: pointer;
  user-select: none;
}

.has-children-title:hover {
  background: rgba(25, 118, 210, 0.08);
}

.title-expand-icon {
  margin-left: 4px;
  opacity: 0.6;
  transition: all 0.2s ease;
}

.has-children-title:hover .title-expand-icon {
  opacity: 1;
  transform: scale(1.2);
}

/* Meta information */
.task-meta-compact {
  display: flex;
  gap: 2px;
  align-items: center;
  font-size: 10px;
  color: #666;
  min-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta-tags,
.meta-assignee,
.meta-date,
.meta-warning {
  display: flex;
  align-items: center;
  gap: 2px;
  white-space: nowrap;
}

.meta-tags {
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta-assignee {
  max-width: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta-date {
  min-width: 60px;
}

/* Hover Action Buttons */
.hover-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transform: translateX(10px);
  transition: all 0.25s ease;
  pointer-events: none;
}

.task-item-compact:hover .hover-actions {
  opacity: 1;
  transform: translateX(0);
  pointer-events: auto;
}

.action-btn {
  min-width: 18px !important;
  width: 18px;
  height: 18px;
  color: #666;
  transition: all 0.2s ease;
  border-radius: 3px;
}

.action-btn:hover {
  background: rgba(25, 118, 210, 0.1);
  color: #1976d2;
  transform: scale(1.1);
}

.delete-btn:hover {
  background: rgba(244, 67, 54, 0.1);
  color: #f44336;
}

.expand-action-btn {
  background: rgba(25, 118, 210, 0.05);
  border: 1px solid rgba(25, 118, 210, 0.2);
}

.expand-action-btn:hover {
  background: rgba(25, 118, 210, 0.15);
  color: #1976d2;
  border-color: rgba(25, 118, 210, 0.4);
  transform: scale(1.15);
}


/* Status-based styling */
.task-status-done .task-title-compact {
  text-decoration: line-through;
  opacity: 0.7;
}

.task-status-blocked .task-item-compact {
  border-left: 3px solid #f44336;
  background: #fff5f5;
}

.task-status-in_progress .task-item-compact {
  border-left: 3px solid #2196f3;
  background: #f8fafe;
}

.task-status-done .task-item-compact {
  background: #f8fff8;
}

/* Hover effects */
.task-item-compact:hover .action-menu-btn {
  background: rgba(0,0,0,0.04);
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .task-row-compact {
    padding: 2px 3px;
  }

  .task-meta-compact {
    min-width: auto;
    gap: 8px;
  }

  .meta-tags,
  .meta-assignee {
    max-width: 50px;
  }

  .task-level-0 .task-row-compact {
    padding-left: 8px;
  }

  .task-level-1 .task-row-compact,
  .task-level-2 .task-row-compact,
  .task-level-3 .task-row-compact,
  .task-level-4 .task-row-compact {
    padding-left: 36px;
    background: rgba(248, 250, 254, 0.5);
  }

  .level-indicator {
    display: none;
  }

  /* Mobile: Show actions on tap instead of hover */
  .hover-actions {
    opacity: 0.7;
    transform: translateX(0);
    pointer-events: auto;
  }

  .task-item-compact:active .hover-actions {
    opacity: 1;
  }
}

/* Drag and drop styling */
.drop-target {
  position: relative;
}

.drop-target:hover::after {
  content: '📥 拖拉到此處成為子任務';
  position: absolute;
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
  background: rgba(25, 118, 210, 0.1);
  color: #1976d2;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 10px;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
  z-index: 10;
}

.drop-target.has-children:hover::after {
  opacity: 0.8;
}

.drag-over {
  background: linear-gradient(90deg, rgba(25, 118, 210, 0.1) 0%, rgba(25, 118, 210, 0.05) 100%) !important;
  border: 2px dashed #1976d2 !important;
  border-radius: 4px;
  transform: scale(1.02);
  box-shadow: 0 4px 12px rgba(25, 118, 210, 0.2);
}

.drag-over::before {
  content: '📥 放在此處';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: #1976d2;
  color: white;
  padding: 4px 12px;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 600;
  z-index: 100;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0% { transform: translate(-50%, -50%) scale(1); }
  50% { transform: translate(-50%, -50%) scale(1.05); }
  100% { transform: translate(-50%, -50%) scale(1); }
}

/* Focus and accessibility */
.action-menu-btn:focus,
.expand-btn-compact:focus,
.status-indicator-compact:focus {
  outline: 2px solid #1976d2;
  outline-offset: 1px;
}

.drag-handle,
.select-checkbox {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
}

.task-item-compact:hover .drag-handle,
.task-item-compact:hover .select-checkbox,
.task-item-compact:focus-within .drag-handle,
.task-item-compact:focus-within .select-checkbox {
  opacity: 1;
  pointer-events: auto;
}
</style>
