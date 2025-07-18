<template>
  <div class="quick-add-task" :class="{ 'active': isActive }">
    <!-- Quick Add Input Row -->
    <div class="quick-add-row" :style="dynamicIndentStyle">
      <!-- Placeholder drag handle and checkbox space -->
      <div class="placeholder-controls">
        <div class="placeholder-drag"></div>
        <div class="placeholder-checkbox"></div>
      </div>

      <!-- Add button or spacer -->
      <div class="add-btn-space">
        <div class="add-spacer"></div>
      </div>

      <!-- Input field -->
      <q-input
        v-if="isActive"
        ref="inputRef"
        v-model="taskTitle"
        placeholder="輸入任務名稱..."
        dense
        borderless
        class="quick-input"
        @keyup.enter="addTask"
        @keyup.esc="cancelAdd"
        @blur="onBlur"
      />

      <!-- Placeholder when not active -->
      <div
        v-else
        class="quick-placeholder"
        @click="startAdding"
      >
        <q-icon name="add" size="xs" class="add-icon" />
        <span class="placeholder-text">快速新增任務...</span>
      </div>

      <!-- Action buttons when active -->
      <div v-if="isActive" class="quick-actions">
        <q-btn
          flat
          dense
          size="xs"
          icon="check"
          color="positive"
          class="action-btn"
          @click="addTask"
          :disable="!taskTitle.trim()"
        />
        <q-btn
          flat
          dense
          size="xs"
          icon="close"
          color="grey-6"
          class="action-btn"
          @click="cancelAdd"
        />
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, nextTick } from 'vue'
import { useTaskStore } from 'src/stores/taskStore'

export default {
  name: 'QuickAddTask',

  props: {
    parentId: {
      type: String,
      default: null
    },
    level: {
      type: Number,
      default: 0
    }
  },

  emits: ['task-added'],

  setup(props, { emit }) {
    const taskStore = useTaskStore()
    const inputRef = ref(null)
    const isActive = ref(false)
    const taskTitle = ref('')

    // Dynamic indentation style to match TaskItem
    const dynamicIndentStyle = computed(() => {
      const baseIndent = 10
      const extraIndent = (props.level - 0) * 24
      const totalIndent = baseIndent + extraIndent

      return {
        paddingLeft: `${totalIndent}px`,
        background: `${Math.min(totalIndent + 24, 240)}px)`
      }
    })

    // Methods
    const startAdding = async () => {
      isActive.value = true
      await nextTick()
      if (inputRef.value) {
        inputRef.value.focus()
      }
    }

    const cancelAdd = () => {
      isActive.value = false
      taskTitle.value = ''
    }

    const addTask = () => {
      if (!taskTitle.value.trim()) return

      // Create new task
      const newTask = {
        title: taskTitle.value.trim(),
        description: '',
        status: 'todo',
        priority: 'medium',
        assignee: '',
        tags: [],
        dependencies: [],
        startTime: null,
        endTime: null,
        parentId: props.parentId
      }

      taskStore.createTask(newTask)
      emit('task-added', newTask)

      // Reset
      taskTitle.value = ''
      isActive.value = false
    }

    const onBlur = () => {
      // Delay hiding to allow button clicks
      setTimeout(() => {
        if (!taskTitle.value.trim()) {
          cancelAdd()
        }
      }, 150)
    }

    return {
      inputRef,
      isActive,
      taskTitle,
      dynamicIndentStyle,
      startAdding,
      cancelAdd,
      addTask,
      onBlur
    }
  }
}
</script>

<style scoped>
.quick-add-task {
  border-bottom: 1px solid #f0f0f0;
  background: white;
  transition: all 0.2s ease;
  position: relative;
  opacity: 0.7;
}

.quick-add-task:hover {
  background: #fafafa;
  opacity: 1;
}

.quick-add-task.active {
  background: #f8fafe;
  border-color: #1976d2;
  opacity: 1;
  box-shadow: inset 0 0 0 1px rgba(25, 118, 210, 0.2);
}

.quick-add-row {
  display: flex;
  align-items: center;
  padding: 2px 2px;
  gap: 2px;
  height: 24px;
  flex-wrap: nowrap;
  min-width: 0;
  width: 100%;
}

/* Placeholder controls to maintain alignment */
.placeholder-controls {
  display: flex;
  align-items: center;
  gap: 1px;
}

.placeholder-drag {
  width: 14px;
  height: 14px;
  opacity: 0.3;
}

.placeholder-checkbox {
  width: 14px;
  height: 14px;
  opacity: 0.3;
}

/* Add button space */
.add-btn-space {
  width: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.add-btn {
  min-width: 16px !important;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgba(25, 118, 210, 0.05);
  border: 1px solid rgba(25, 118, 210, 0.1);
  color: #1976d2;
}

.add-btn:hover {
  background: rgba(25, 118, 210, 0.1);
  border-color: rgba(25, 118, 210, 0.3);
  transform: scale(1.1);
}

.add-spacer {
  width: 16px;
}

/* Quick input */
.quick-input {
  flex: 1;
  font-size: 14px;
  min-width: 120px;
  padding: 0px;
  height: 24px;
  overflow: hidden;
}

.quick-input :deep(.q-field__control) {
  background: transparent;
  height: 24px !important;
  min-height: 24px !important;
  overflow: hidden;
}

.quick-input :deep(.q-field__inner) {
  height: 24px !important;
  min-height: 24px !important;
}

.quick-input :deep(.q-field__marginal) {
  height: 24px !important;
}

.quick-input :deep(.q-field__native) {
  color: #333;
  font-weight: 500;
  height: 24px !important;
  line-height: 24px !important;
  padding: 0 !important;
  margin: 0 !important;
}

/* Placeholder */
.quick-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  transition: all 0.2s ease;
  min-width: 120px;
}

.quick-placeholder:hover {
  background: rgba(25, 118, 210, 0.05);
  color: #1976d2;
}

.add-icon {
  color: #999;
  transition: color 0.2s ease;
}

.quick-placeholder:hover .add-icon {
  color: #1976d2;
}

.placeholder-text {
  font-size: 13px;
  color: #999;
  font-style: italic;
  transition: color 0.2s ease;
}

.quick-placeholder:hover .placeholder-text {
  color: #1976d2;
}

/* Action buttons */
.quick-actions {
  display: flex;
  gap: 2px;
  height: 24px;
  align-items: center;
}

.action-btn {
  min-width: 18px !important;
  width: 18px;
  height: 18px;
  border-radius: 3px;
}

.action-btn:hover {
  transform: scale(1.1);
}

/* Meta space alignment */
.quick-add-row::after {
  content: '';
  min-width: 120px;
  opacity: 0;
}

/* Focus states */
.quick-input.q-field--focused {
  background: rgba(25, 118, 210, 0.02);
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .quick-add-row {
    padding: 2px 3px;
  }

  .placeholder-text {
    font-size: 12px;
  }

  .quick-input {
    font-size: 13px;
  }

  .quick-add-row::after {
    min-width: 80px;
  }
}
</style>
