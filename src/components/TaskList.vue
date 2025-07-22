<template>
  <div class="task-list" :data-parent-id="parentId || 'root'">
    <draggable
      v-model="localTasks"
      :group="{ name: 'tasks', pull: true, put: true }"
      item-key="id"
      handle=".drag-handle"
      @start="onDragStart"
      @end="onDragEnd"
      @change="onDragChange"
      animation="150"
      ghost-class="task-ghost"
      chosen-class="task-chosen"
      drag-class="task-drag"
    >
      <template #item="{ element: task }">
        <div class="task-wrapper">
          <TaskItem
            :key="task.id"
            :task="task"
            :level="level"
            @edit="$emit('edit-task', $event)"
            @delete="$emit('delete-task', $event)"
            @status-change="$emit('status-change', $event)"
            @add-subtask="$emit('add-subtask', $event)"
            @duplicate="$emit('duplicate-task', $event)"
            @toggle-expand="toggleExpand"
          />

          <!-- Render children recursively -->
          <div v-if="task.children && task.children.length > 0 && taskStore.isTaskExpanded(task.id)" class="task-children">
            <TaskList
              :tasks="task.children"
              :parent-id="task.id"
              :level="level + 1"
              @edit-task="$emit('edit-task', $event)"
              @delete-task="$emit('delete-task', $event)"
              @status-change="$emit('status-change', $event)"
              @add-subtask="$emit('add-subtask', $event)"
              @duplicate-task="$emit('duplicate-task', $event)"
            />
          </div>
        </div>
      </template>
    </draggable>

    <!-- Quick Add Task at bottom -->
    <QuickAddTask
      :parent-id="parentId"
      :level="level"
      @task-added="onTaskAdded"
    />
  </div>
</template>

<script>
import { computed } from 'vue'
import { useTaskStore } from 'src/stores/taskStore'
import draggable from 'vuedraggable'
import TaskItem from './TaskItem.vue'
import QuickAddTask from './QuickAddTask.vue'

export default {
  name: 'TaskList',

  components: {
    draggable,
    TaskItem,
    QuickAddTask
  },

  props: {
    tasks: {
      type: Array,
      default: () => []
    },
    parentId: {
      type: String,
      default: null
    },
    level: {
      type: Number,
      default: 0
    }
  },

  emits: ['edit-task', 'delete-task', 'status-change', 'add-subtask', 'duplicate-task'],

  expose: ['expandAll', 'collapseAll'],

  setup(props) {
    const taskStore = useTaskStore()

    // Local reactive copy of tasks for draggable
    const localTasks = computed({
      get: () => props.tasks,
      set: () => {
        // Don't handle updates here, let onDragChange handle all drag operations
        // This prevents double updates and conflicts with updateTaskOrder
      }
    })

    // Handle drag start event
    const onDragStart = (event) => {
      const { item } = event
      const taskId = item.dataset.taskId

      // Set drag data for cross-component drops
      if (event.originalEvent && event.originalEvent.dataTransfer) {
        event.originalEvent.dataTransfer.setData('text/plain', taskId)
        event.originalEvent.dataTransfer.effectAllowed = 'move'
      }
    }

    // Handle drag change event (more reliable for cross-level drops)
    const onDragChange = (event) => {
      console.log('[TaskList] onDragChange:', event)
      
      if (event.added) {
        // Task was added to this list
        const { element: task, newIndex } = event.added
        console.log('[TaskList] Task added:', task.id, 'newIndex:', newIndex, 'parentId:', props.parentId)

        // Update the task's parent and sort order
        taskStore.updateTaskOrder(task.id, props.parentId, newIndex)
      }

      if (event.moved) {
        // Task was moved within this list
        const { element: task, newIndex } = event.moved
        console.log('[TaskList] Task moved:', task.id, 'newIndex:', newIndex, 'parentId:', props.parentId)

        // Update sort order only
        taskStore.updateTaskOrder(task.id, props.parentId, newIndex)
      }
      
      // Force a small delay to see if UI updates after drag
      setTimeout(() => {
        console.log('[TaskList] Post-drag tasks length:', props.tasks.length)
      }, 100)
    }

    // Handle drag end event (fallback)
    const onDragEnd = () => {
      // The onDragChange should handle most cases, but keep this for consistency
    }

    // Toggle task expansion
    const toggleExpand = (taskId) => {
      taskStore.toggleTaskExpansion(taskId)
    }

    // Expand all tasks (delegated to store)
    const expandAll = () => {
      taskStore.expandAllTasks()
    }

    // Collapse all tasks (delegated to store)
    const collapseAll = () => {
      taskStore.collapseAllTasks()
    }

    // Handle task added from QuickAddTask
    const onTaskAdded = () => {
      // Task is already added to store by QuickAddTask component
      // We can emit an event if parent needs to know
    }

    return {
      taskStore,
      localTasks,
      onDragStart,
      onDragChange,
      onDragEnd,
      toggleExpand,
      expandAll,
      collapseAll,
      onTaskAdded
    }
  }
}
</script>

<style scoped>
.task-list {
  min-height: 20px;
}

.task-wrapper {
  margin-bottom: 0;
}

.task-children {
  position: relative;
}

:deep(.task-ghost) {
  opacity: 0.5;
  background: #f5f5f5;
}

:deep(.task-chosen) {
  background: #e3f2fd;
}

:deep(.task-drag) {
  transform: rotate(2deg);
  box-shadow: 0 4px 8px rgba(0,0,0,0.15);
}
</style>
