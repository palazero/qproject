<template>
  <q-dialog v-model="showDialog" persistent>
    <q-card style="min-width: 500px">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">{{ isEdit ? '編輯專案' : '建立新專案' }}</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-form @submit="onSubmit" class="q-gutter-md">
        <q-card-section>
          <q-input
            v-model="form.name"
            label="專案名稱 *"
            required
            :rules="[val => !!val || '請輸入專案名稱']"
            dense
            outlined
          />

          <q-input
            v-model="form.description"
            label="專案描述"
            type="textarea"
            rows="3"
            dense
            outlined
            class="q-mt-md"
          />

          <q-expansion-item
            label="進階設定"
            icon="settings"
            class="q-mt-md"
          >
            <q-card-section class="q-pt-none">
              <div class="text-subtitle2 q-mb-sm">專案設定</div>
              
              <q-toggle
                v-model="form.settings.enableGanttView"
                label="啟用甘特圖檢視"
                class="q-mb-sm"
              />
              
              <q-toggle
                v-model="form.settings.enableTimeTracking"
                label="啟用時間追蹤"
                class="q-mb-sm"
              />
              
              <q-toggle
                v-model="form.settings.autoAssignTasks"
                label="自動分配任務"
                class="q-mb-sm"
              />

              <q-select
                v-model="form.settings.defaultTaskPriority"
                :options="priorityOptions"
                label="預設任務優先級"
                dense
                outlined
                class="q-mt-md"
              />

              <q-select
                v-model="form.settings.workDays"
                :options="workDayOptions"
                multiple
                label="工作日"
                dense
                outlined
                class="q-mt-md"
              />
            </q-card-section>
          </q-expansion-item>
        </q-card-section>

        <!-- Project Status Management (Edit Mode Only) -->
        <q-card-section v-if="isEdit && project" class="q-pt-none">
          <q-separator class="q-mb-md" />
          <div class="text-subtitle2 q-mb-sm">專案狀態管理</div>
          
          <div class="row q-gutter-sm">
            <q-chip
              :color="getStatusColor(project.status)"
              text-color="white"
              icon="label"
              :label="getStatusLabel(project.status)"
            />
            
            <q-space />
            
            <!-- Status Action Buttons -->
            <q-btn
              v-if="project.status === 'open' && projectStore.canCloseProject(project.id)"
              flat
              color="orange"
              icon="archive"
              label="關閉專案"
              @click="confirmCloseProject"
              :loading="statusLoading"
            />
            
            <q-btn
              v-if="project.status === 'open' && projectStore.canCancelProject(project.id)"
              flat
              color="negative"
              icon="cancel"
              label="取消專案"
              @click="confirmCancelProject"
              :loading="statusLoading"
            />
            
            <q-btn
              v-if="(project.status === 'close' || project.status === 'cancel') && projectStore.canCancelProject(project.id)"
              flat
              color="positive"
              icon="restart_alt"
              label="重新開啟"
              @click="confirmReopenProject"
              :loading="statusLoading"
            />
          </div>
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="取消" v-close-popup />
          <q-btn
            type="submit"
            color="primary"
            :label="isEdit ? '更新' : '建立'"
            :loading="loading"
          />
        </q-card-actions>
      </q-form>
    </q-card>
  </q-dialog>
</template>

<script>
import { ref, computed, watch } from 'vue'
import { useProjectStore } from 'src/stores/projectStore'
import { useTaskStore } from 'src/stores/taskStore'
import { Notify, Dialog } from 'quasar'

export default {
  name: 'ProjectDialog',
  props: {
    modelValue: {
      type: Boolean,
      default: false
    },
    project: {
      type: Object,
      default: null
    }
  },
  emits: ['update:modelValue', 'project-created', 'project-updated'],
  setup(props, { emit }) {
    const projectStore = useProjectStore()
    const taskStore = useTaskStore()
    
    const loading = ref(false)
    const statusLoading = ref(false)
    const form = ref({
      name: '',
      description: '',
      settings: {
        enableGanttView: true,
        enableTimeTracking: false,
        autoAssignTasks: false,
        defaultTaskPriority: 'medium',
        workDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
      }
    })

    const priorityOptions = [
      { label: '低', value: 'low' },
      { label: '中', value: 'medium' },
      { label: '高', value: 'high' }
    ]

    const workDayOptions = [
      { label: '週一', value: 'monday' },
      { label: '週二', value: 'tuesday' },
      { label: '週三', value: 'wednesday' },
      { label: '週四', value: 'thursday' },
      { label: '週五', value: 'friday' },
      { label: '週六', value: 'saturday' },
      { label: '週日', value: 'sunday' }
    ]

    const showDialog = computed({
      get: () => props.modelValue,
      set: (value) => emit('update:modelValue', value)
    })

    const isEdit = computed(() => !!props.project)

    const resetForm = () => {
      form.value = {
        name: '',
        description: '',
        settings: {
          enableGanttView: true,
          enableTimeTracking: false,
          autoAssignTasks: false,
          defaultTaskPriority: 'medium',
          workDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
        }
      }
    }

    const loadProjectData = () => {
      if (props.project) {
        form.value = {
          name: props.project.name || '',
          description: props.project.description || '',
          settings: {
            enableGanttView: props.project.settings?.enableGanttView ?? true,
            enableTimeTracking: props.project.settings?.enableTimeTracking ?? false,
            autoAssignTasks: props.project.settings?.autoAssignTasks ?? false,
            defaultTaskPriority: props.project.settings?.defaultTaskPriority || 'medium',
            workDays: props.project.settings?.workDays || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
          }
        }
      } else {
        resetForm()
      }
    }

    const onSubmit = async () => {
      loading.value = true
      
      try {
        const projectData = {
          name: form.value.name,
          description: form.value.description,
          settings: form.value.settings
        }

        if (isEdit.value) {
          await projectStore.updateProject(props.project.id, projectData)
          emit('project-updated', { ...props.project, ...projectData })
          Notify.create({
            type: 'positive',
            message: '專案更新成功',
            position: 'top'
          })
        } else {
          const newProject = await projectStore.createProject(projectData)
          emit('project-created', newProject)
          Notify.create({
            type: 'positive',
            message: '專案建立成功',
            position: 'top'
          })
        }

        showDialog.value = false
        resetForm()
      } catch (error) {
        console.error('Failed to save project:', error)
        Notify.create({
          type: 'negative',
          message: `${isEdit.value ? '更新' : '建立'}專案失敗: ${error.message}`,
          position: 'top'
        })
      } finally {
        loading.value = false
      }
    }

    // Project status management methods
    const getStatusColor = (status) => {
      const colors = {
        'open': 'positive',
        'close': 'orange',
        'cancel': 'negative'
      }
      return colors[status] || 'grey'
    }

    const getStatusLabel = (status) => {
      const labels = {
        'open': '進行中',
        'close': '已關閉',
        'cancel': '已取消'
      }
      return labels[status] || '未知'
    }

    const confirmCloseProject = () => {
      Dialog.create({
        title: '確認關閉專案',
        message: '關閉專案前，請確認所有任務都已完成。關閉後的專案將不會顯示在專案列表中。',
        cancel: true,
        persistent: true
      }).onOk(async () => {
        await handleCloseProject()
      })
    }

    const confirmCancelProject = () => {
      Dialog.create({
        title: '確認取消專案',
        message: '取消專案將會停止所有進行中的工作。此操作無法復原，確定要繼續嗎？',
        cancel: true,
        persistent: true
      }).onOk(async () => {
        await handleCancelProject()
      })
    }

    const confirmReopenProject = () => {
      Dialog.create({
        title: '確認重新開啟專案',
        message: '重新開啟專案後，將會重新顯示在專案列表中，可以繼續進行工作。',
        cancel: true,
        persistent: true
      }).onOk(async () => {
        await handleReopenProject()
      })
    }

    const handleCloseProject = async () => {
      statusLoading.value = true
      try {
        const success = await projectStore.closeProject(props.project.id, taskStore)
        if (success) {
          emit('project-updated', { ...props.project, status: 'close' })
          showDialog.value = false
        }
      } catch (error) {
        console.error('Failed to close project:', error)
      } finally {
        statusLoading.value = false
      }
    }

    const handleCancelProject = async () => {
      statusLoading.value = true
      try {
        const success = await projectStore.cancelProject(props.project.id)
        if (success) {
          emit('project-updated', { ...props.project, status: 'cancel' })
          showDialog.value = false
        }
      } catch (error) {
        console.error('Failed to cancel project:', error)
      } finally {
        statusLoading.value = false
      }
    }

    const handleReopenProject = async () => {
      statusLoading.value = true
      try {
        const success = await projectStore.reopenProject(props.project.id)
        if (success) {
          emit('project-updated', { ...props.project, status: 'open' })
          showDialog.value = false
        }
      } catch (error) {
        console.error('Failed to reopen project:', error)
      } finally {
        statusLoading.value = false
      }
    }

    watch(() => props.project, loadProjectData, { immediate: true })
    watch(() => props.modelValue, (newVal) => {
      if (newVal) {
        loadProjectData()
      }
    })

    return {
      showDialog,
      form,
      loading,
      statusLoading,
      isEdit,
      priorityOptions,
      workDayOptions,
      onSubmit,
      resetForm,
      projectStore,
      getStatusColor,
      getStatusLabel,
      confirmCloseProject,
      confirmCancelProject,
      confirmReopenProject
    }
  }
}
</script>

<style scoped>
.q-card {
  border-radius: 8px;
}

.q-expansion-item {
  border: 1px solid #e0e0e0;
  border-radius: 4px;
}
</style>