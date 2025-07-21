<template>
  <q-dialog v-model="show" persistent max-width="900px" class="task-dialog-wrapper">
    <q-card class="task-edit-dialog">
      <!-- Enhanced Header -->
      <q-card-section class="dialog-header">
        <div class="row items-center no-wrap">
          <q-icon 
            :name="isEditing ? 'edit' : 'add_task'" 
            size="24px" 
            :color="isEditing ? 'primary' : 'positive'"
            class="q-mr-sm"
          />
          <div>
            <div class="text-h6 text-weight-medium">
              {{ isEditing ? '編輯任務' : '新增任務' }}
            </div>
            <div class="text-caption text-grey-6" v-if="isEditing">
              任務ID: {{ taskId }}
            </div>
          </div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup class="close-btn" />
        </div>
      </q-card-section>

      <!-- Progress Indicator -->
      <q-linear-progress 
        v-if="saving" 
        indeterminate 
        color="primary" 
        class="loading-bar"
      />

      <q-card-section class="dialog-content">
        <q-form @submit="onSubmit" class="form-container">
          <!-- Basic Information Section -->
          <div class="form-section">
            <div class="section-header">
              <q-icon name="info" color="primary" size="20px" />
              <span class="section-title">基本資訊</span>
            </div>
            
            <div class="section-content">
              <!-- Task Title -->
              <q-input
                v-model="formData.title"
                label="任務標題"
                outlined
                dense
                :rules="[val => !!val || '請輸入任務標題']"
                ref="titleInput"
                class="title-input"
              >
                <template v-slot:prepend>
                  <q-icon name="title" color="grey-6" />
                </template>
              </q-input>

              <!-- Task Description -->
              <q-input
                v-model="formData.description"
                label="任務描述"
                outlined
                dense
                type="textarea"
                rows="3"
                class="description-input"
              >
                <template v-slot:prepend>
                  <q-icon name="description" color="grey-6" />
                </template>
              </q-input>

              <!-- Parent Task Selection -->
              <q-select
                v-model="formData.parentId"
                :options="parentOptions"
                option-value="value"
                option-label="label"
                label="上層任務"
                outlined
                dense
                clearable
                emit-value
                map-options
              >
                <template v-slot:prepend>
                  <q-icon name="account_tree" color="grey-6" />
                </template>
              </q-select>
            </div>
          </div>

          <!-- Schedule Section -->
          <div class="form-section">
            <div class="section-header">
              <q-icon name="schedule" color="primary" size="20px" />
              <span class="section-title">時程安排</span>
            </div>
            
            <div class="section-content">
              <div class="row q-gutter-md">
                <div class="col">
                  <q-input
                    v-model="formData.startTime"
                    label="開始時間"
                    outlined
                    dense
                    type="datetime-local"
                  >
                    <template v-slot:prepend>
                      <q-icon name="play_arrow" color="green" />
                    </template>
                  </q-input>
                </div>
                <div class="col">
                  <q-input
                    v-model="formData.endTime"
                    label="結束時間"
                    outlined
                    dense
                    type="datetime-local"
                    :rules="[validateEndTime]"
                  >
                    <template v-slot:prepend>
                      <q-icon name="stop" color="red" />
                    </template>
                  </q-input>
                </div>
              </div>
            </div>
          </div>

          <!-- Assignment & Status Section -->
          <div class="form-section">
            <div class="section-header">
              <q-icon name="assignment" color="primary" size="20px" />
              <span class="section-title">指派與狀態</span>
            </div>
            
            <div class="section-content">
              <div class="row q-gutter-md">
                <div class="col-12 col-md-6">
                  <q-input
                    v-model="formData.assignee"
                    label="執行人"
                    outlined
                    dense
                  >
                    <template v-slot:prepend>
                      <q-icon name="person" color="grey-6" />
                    </template>
                  </q-input>
                </div>
                
                <div class="col-12 col-md-3">
                  <q-select
                    v-model="formData.status"
                    :options="statusOptions"
                    label="狀態"
                    outlined
                    dense
                    emit-value
                    map-options
                  >
                    <template v-slot:prepend>
                      <q-icon 
                        :name="getStatusIcon(formData.status)" 
                        :color="getStatusColor(formData.status)" 
                      />
                    </template>
                  </q-select>
                </div>
                
                <div class="col-12 col-md-3">
                  <q-select
                    v-model="formData.priority"
                    :options="priorityOptions"
                    label="優先級"
                    outlined
                    dense
                    emit-value
                    map-options
                  >
                    <template v-slot:prepend>
                      <q-icon 
                        name="flag" 
                        :color="getPriorityColor(formData.priority)" 
                      />
                    </template>
                  </q-select>
                </div>
              </div>
            </div>
          </div>

          <!-- Tags & Dependencies Section -->
          <div class="form-section">
            <div class="section-header">
              <q-icon name="link" color="primary" size="20px" />
              <span class="section-title">標籤與依賴</span>
            </div>
            
            <div class="section-content">
              <!-- Tags -->
              <q-select
                v-model="formData.tags"
                :options="tagOptions"
                label="標籤"
                outlined
                dense
                multiple
                use-chips
                use-input
                input-debounce="0"
                new-value-mode="add-unique"
                @new-value="addNewTag"
              >
                <template v-slot:prepend>
                  <q-icon name="label" color="grey-6" />
                </template>
              </q-select>

              <!-- Dependencies -->
              <q-select
                v-model="formData.dependencies"
                :options="dependencyOptions"
                option-value="value"
                option-label="label"
                label="依賴任務"
                outlined
                dense
                multiple
                use-chips
                emit-value
                map-options
                :rules="[validateDependencies]"
              >
                <template v-slot:prepend>
                  <q-icon name="device_hub" color="grey-6" />
                </template>
              </q-select>

              <!-- Dependency Warning -->
              <q-banner
                v-if="dependencyWarning"
                class="dependency-warning"
                rounded
              >
                <template v-slot:avatar>
                  <q-icon name="warning" color="orange" />
                </template>
                {{ dependencyWarning }}
              </q-banner>
            </div>
          </div>
        </q-form>
      </q-card-section>

      <!-- Enhanced Actions -->
      <q-card-actions class="dialog-actions">
        <div class="actions-left">
          <q-btn 
            flat 
            icon="delete" 
            label="刪除任務" 
            color="negative" 
            v-if="isEditing"
            @click="confirmDelete"
            class="delete-btn"
          />
        </div>
        
        <div class="actions-right">
          <q-btn 
            flat 
            icon="close"
            label="取消" 
            v-close-popup 
            class="cancel-btn"
          />
          <q-btn 
            unelevated 
            :icon="isEditing ? 'save' : 'add'" 
            :label="isEditing ? '更新任務' : '建立任務'" 
            color="primary" 
            @click="onSubmit"
            :loading="saving"
            class="submit-btn"
          />
        </div>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import { ref, computed, watch, nextTick } from 'vue'
import { useTaskStore } from 'src/stores/taskStore'
import { useQuasar } from 'quasar'

export default {
  name: 'TaskEditDialog',
  
  props: {
    modelValue: {
      type: Boolean,
      default: false
    },
    taskId: {
      type: String,
      default: null
    },
    parentId: {
      type: String,
      default: null
    },
    initialData: {
      type: Object,
      default: null
    }
  },
  
  emits: ['update:modelValue', 'task-saved', 'task-deleted'],
  
  setup(props, { emit }) {
    const taskStore = useTaskStore()
    const $q = useQuasar()
    
    const titleInput = ref(null)
    const saving = ref(false)
    
    // Dialog visibility
    const show = computed({
      get: () => props.modelValue,
      set: (val) => emit('update:modelValue', val)
    })
    
    // Form data
    const formData = ref({
      title: '',
      description: '',
      parentId: null,
      startTime: '',
      endTime: '',
      assignee: '',
      status: 'todo',
      priority: 'medium',
      tags: [],
      dependencies: []
    })
    
    // Check if editing existing task
    const isEditing = computed(() => !!props.taskId)
    
    // Status options
    const statusOptions = [
      { label: '待辦', value: 'todo' },
      { label: '進行中', value: 'in_progress' },
      { label: '已完成', value: 'done' },
      { label: '阻塞', value: 'blocked' }
    ]
    
    // Priority options
    const priorityOptions = [
      { label: '低', value: 'low' },
      { label: '中', value: 'medium' },
      { label: '高', value: 'high' }
    ]
    
    // Tag options
    const tagOptions = computed(() => {
      return taskStore.tags.map(tag => tag)
    })
    
    // Parent task options
    const parentOptions = computed(() => {
      const options = []
      
      const buildOptions = (tasks, level = 0) => {
        tasks.forEach(task => {
          // Don't allow circular parent relationships
          if (task.id !== props.taskId) {
            options.push({
              label: '　'.repeat(level) + task.title,
              value: task.id
            })
            
            if (task.children && task.children.length > 0) {
              buildOptions(task.children, level + 1)
            }
          }
        })
      }
      
      buildOptions(taskStore.taskTree)
      return options
    })
    
    // Dependency options (exclude self and descendants)
    const dependencyOptions = computed(() => {
      const options = []
      const excludeIds = new Set()
      
      // If editing, exclude self and descendants
      if (props.taskId) {
        excludeIds.add(props.taskId)
        
        const addDescendants = (taskId) => {
          const task = taskStore.getTaskById(taskId)
          if (task && task.children) {
            task.children.forEach(child => {
              excludeIds.add(child.id)
              addDescendants(child.id)
            })
          }
        }
        
        addDescendants(props.taskId)
      }
      
      taskStore.tasks.forEach(task => {
        if (!excludeIds.has(task.id)) {
          options.push({
            label: task.title,
            value: task.id
          })
        }
      })
      
      return options
    })
    
    // Dependency warning
    const dependencyWarning = computed(() => {
      if (!formData.value.dependencies.length) return null
      
      const incompleteDeps = formData.value.dependencies.filter(depId => {
        const depTask = taskStore.getTaskById(depId)
        return depTask && depTask.status !== 'done'
      })
      
      if (incompleteDeps.length > 0 && formData.value.status === 'done') {
        return '注意：有未完成的依賴任務，無法標記為已完成'
      }
      
      return null
    })
    
    // Validation
    const validateEndTime = (val) => {
      if (!val || !formData.value.startTime) return true
      
      const start = new Date(formData.value.startTime)
      const end = new Date(val)
      
      return end >= start || '結束時間不能早於開始時間'
    }
    
    const validateDependencies = (val) => {
      if (!val || val.length === 0) return true
      
      // Check for circular dependencies
      if (props.taskId && taskStore.hasCircularDependency(props.taskId, val)) {
        return '無法建立循環依賴關係'
      }
      
      return true
    }
    
    // Methods
    const loadTaskData = () => {
      if (props.taskId) {
        const task = taskStore.getTaskById(props.taskId)
        if (task) {
          formData.value = {
            title: task.title,
            description: task.description,
            parentId: task.parentId,
            startTime: task.startTime ? formatDateTimeLocal(task.startTime) : '',
            endTime: task.endTime ? formatDateTimeLocal(task.endTime) : '',
            assignee: task.assignee,
            status: task.status,
            priority: task.priority,
            tags: [...task.tags],
            dependencies: [...task.dependencies]
          }
        }
      } else {
        // Reset form for new task
        formData.value = {
          title: props.initialData?.title || '',
          description: props.initialData?.description || '',
          parentId: props.parentId || null,
          startTime: props.initialData?.startTime ? formatDateTimeLocal(props.initialData.startTime) : '',
          endTime: props.initialData?.endTime ? formatDateTimeLocal(props.initialData.endTime) : '',
          assignee: props.initialData?.assignee || '',
          status: props.initialData?.status || 'todo',
          priority: props.initialData?.priority || 'medium',
          tags: props.initialData?.tags ? [...props.initialData.tags] : [],
          dependencies: props.initialData?.dependencies ? [...props.initialData.dependencies] : []
        }
      }
    }
    
    const formatDateTimeLocal = (isoString) => {
      if (!isoString) return ''
      
      const date = new Date(isoString)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      
      return `${year}-${month}-${day}T${hours}:${minutes}`
    }
    
    const addNewTag = (val, done) => {
      if (val.length > 0) {
        taskStore.addTag(val)
        done(val, 'add-unique')
      }
    }
    
    const onSubmit = async () => {
      saving.value = true
      
      try {
        const taskData = {
          ...formData.value,
          startTime: formData.value.startTime ? new Date(formData.value.startTime).toISOString() : null,
          endTime: formData.value.endTime ? new Date(formData.value.endTime).toISOString() : null
        }
        
        if (isEditing.value) {
          taskStore.updateTask(props.taskId, taskData)
          $q.notify({
            message: '任務已更新',
            color: 'positive',
            icon: 'check_circle'
          })
        } else {
          taskStore.createTask(taskData)
          $q.notify({
            message: '任務已建立',
            color: 'positive',
            icon: 'add_circle'
          })
        }
        
        emit('task-saved')
        show.value = false
      } catch (error) {
        $q.notify({
          message: '儲存失敗：' + error.message,
          color: 'negative',
          icon: 'error'
        })
      } finally {
        saving.value = false
      }
    }
    
    const confirmDelete = () => {
      $q.dialog({
        title: '確認刪除',
        message: '確定要刪除此任務嗎？這個動作無法復原。',
        cancel: true,
        persistent: true
      }).onOk(() => {
        taskStore.deleteTask(props.taskId)
        emit('task-deleted')
        show.value = false
        $q.notify({
          message: '任務已刪除',
          color: 'info',
          icon: 'delete'
        })
      })
    }

    // UI Helper functions
    const getStatusIcon = (status) => {
      const icons = {
        todo: 'radio_button_unchecked',
        in_progress: 'play_circle',
        done: 'check_circle',
        blocked: 'block'
      }
      return icons[status] || 'radio_button_unchecked'
    }

    const getStatusColor = (status) => {
      const colors = {
        todo: 'grey-6',
        in_progress: 'blue',
        done: 'green',
        blocked: 'red'
      }
      return colors[status] || 'grey-6'
    }

    const getPriorityColor = (priority) => {
      const colors = {
        low: 'purple',
        medium: 'orange',
        high: 'red'
      }
      return colors[priority] || 'orange'
    }
    
    // Watch for dialog open/close
    watch(show, async (newVal) => {
      if (newVal) {
        loadTaskData()
        // Focus on title input when dialog opens
        await nextTick()
        titleInput.value?.focus()
      }
    })
    
    return {
      show,
      titleInput,
      saving,
      formData,
      isEditing,
      statusOptions,
      priorityOptions,
      tagOptions,
      parentOptions,
      dependencyOptions,
      dependencyWarning,
      validateEndTime,
      validateDependencies,
      addNewTag,
      onSubmit,
      confirmDelete,
      getStatusIcon,
      getStatusColor,
      getPriorityColor
    }
  }
}
</script>

<style scoped>
/* Dialog Container */
.task-dialog-wrapper {
  backdrop-filter: blur(4px);
}

.task-edit-dialog {
  width: 100%;
  max-width: 900px;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}

/* Header Styling */
.dialog-header {
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  border-bottom: 1px solid #e1e5e9;
  padding: 20px 24px;
}

.close-btn {
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  transform: scale(1.1);
}

/* Loading Bar */
.loading-bar {
  height: 3px;
}

/* Content Area */
.dialog-content {
  max-height: 70vh;
  overflow-y: auto;
  padding: 24px;
  background: #fafbfc;
}

.form-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* Form Sections */
.form-section {
  background: white;
  border-radius: 8px;
  border: 1px solid #e1e5e9;
  overflow: hidden;
  transition: all 0.2s ease;
}

.form-section:hover {
  border-color: #1976d2;
  box-shadow: 0 2px 8px rgba(25, 118, 210, 0.1);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: #f8f9fa;
  border-bottom: 1px solid #e1e5e9;
}

.section-title {
  font-weight: 600;
  color: #2c3e50;
  font-size: 14px;
}

.section-content {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Input Enhancements */
.title-input {
  font-weight: 500;
}

.description-input :deep(.q-field__control) {
  min-height: 80px;
}

/* Actions Section */
.dialog-actions {
  background: white;
  border-top: 1px solid #e1e5e9;
  padding: 16px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.actions-left {
  flex: 1;
}

.actions-right {
  display: flex;
  gap: 8px;
}

.delete-btn {
  transition: all 0.2s ease;
}

.delete-btn:hover {
  background: rgba(244, 67, 54, 0.1);
  transform: translateY(-1px);
}

.cancel-btn {
  transition: all 0.2s ease;
}

.cancel-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}

.submit-btn {
  transition: all 0.2s ease;
  box-shadow: 0 2px 4px rgba(25, 118, 210, 0.2);
}

.submit-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(25, 118, 210, 0.3);
}

/* Warning Banner */
.dependency-warning {
  background: linear-gradient(90deg, #fff3cd 0%, #ffeaa7 100%);
  border: 1px solid #f0ad4e;
  color: #856404;
  margin-top: 8px;
}

/* Custom Scrollbar */
.dialog-content::-webkit-scrollbar {
  width: 6px;
}

.dialog-content::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.dialog-content::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.dialog-content::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

/* Animation for sections */
.form-section {
  animation: slideInUp 0.3s ease-out;
}

@keyframes slideInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .task-edit-dialog {
    margin: 8px;
    max-width: calc(100vw - 16px);
    border-radius: 8px;
  }
  
  .dialog-header {
    padding: 16px;
  }
  
  .dialog-content {
    padding: 16px;
    max-height: 75vh;
  }
  
  .form-container {
    gap: 16px;
  }
  
  .section-content {
    padding: 12px;
    gap: 12px;
  }
  
  .dialog-actions {
    padding: 12px 16px;
    flex-direction: column;
    gap: 8px;
  }
  
  .actions-left,
  .actions-right {
    width: 100%;
    justify-content: center;
  }
  
  .actions-right {
    flex-direction: row-reverse;
  }
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .dialog-header {
    background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
    color: white;
  }
  
  .dialog-content {
    background: #2c3e50;
  }
  
  .form-section {
    background: #34495e;
    border-color: #455a64;
  }
  
  .section-header {
    background: #455a64;
    border-color: #546e7a;
  }
  
  .section-title {
    color: #ecf0f1;
  }
}
</style>