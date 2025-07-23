<template>
  <q-dialog v-model="showDialog" persistent>
    <q-card style="min-width: 700px; max-width: 900px;">
      <q-card-section class="row items-center q-pb-none">
        <q-icon name="merge_type" color="warning" size="24px" class="q-mr-sm" />
        <div class="text-h6">解決資料衝突</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section v-if="conflict">
        <!-- Conflict Summary -->
        <div class="q-mb-md">
          <q-banner class="bg-warning text-white rounded-borders q-mb-md">
            <template v-slot:avatar>
              <q-icon name="warning" />
            </template>
            檢測到 {{ getEntityLabel(conflict.entityType) }} 的資料衝突：
            <strong>{{ getEntityTitle(conflict) }}</strong>
          </q-banner>

          <div class="row q-gutter-md">
            <div class="col">
              <q-chip icon="schedule" color="info" text-color="white">
                本地修改: {{ formatTimestamp(conflict.localTimestamp) }}
              </q-chip>
            </div>
            <div class="col">
              <q-chip icon="cloud" color="primary" text-color="white">
                伺服器修改: {{ formatTimestamp(conflict.serverTimestamp) }}
              </q-chip>
            </div>
          </div>
        </div>

        <!-- Conflict Fields -->
        <div class="text-subtitle1 q-mb-sm">衝突的欄位：</div>
        
        <div v-for="fieldConflict in conflict.conflicts" :key="fieldConflict.field" class="q-mb-lg">
          <q-card flat bordered class="conflict-field-card">
            <q-card-section>
              <div class="row items-center q-mb-sm">
                <q-icon 
                  :name="getFieldIcon(fieldConflict.field)" 
                  class="q-mr-sm" 
                  :color="fieldConflict.canAutoMerge ? 'positive' : 'warning'"
                />
                <div class="text-h6">{{ getFieldLabel(fieldConflict.field) }}</div>
                <q-space />
                <q-chip 
                  v-if="fieldConflict.canAutoMerge" 
                  size="sm" 
                  color="positive" 
                  text-color="white"
                  icon="auto_fix_high"
                >
                  可自動合併
                </q-chip>
              </div>

              <div class="row q-gutter-md">
                <!-- Local Value -->
                <div class="col">
                  <q-card flat class="bg-blue-1">
                    <q-card-section class="q-pa-sm">
                      <div class="text-caption text-primary q-mb-xs">本地版本</div>
                      <div class="field-value">
                        {{ formatFieldValue(fieldConflict.localValue, fieldConflict.field) }}
                      </div>
                    </q-card-section>
                  </q-card>
                  <q-radio 
                    v-model="resolutionChoices[fieldConflict.field]" 
                    val="local" 
                    label="使用本地版本"
                    color="primary"
                    class="q-mt-sm"
                    :disable="fieldConflict.canAutoMerge && autoMergeEnabled"
                  />
                </div>

                <!-- Server Value -->
                <div class="col">
                  <q-card flat class="bg-green-1">
                    <q-card-section class="q-pa-sm">
                      <div class="text-caption text-positive q-mb-xs">伺服器版本</div>
                      <div class="field-value">
                        {{ formatFieldValue(fieldConflict.serverValue, fieldConflict.field) }}
                      </div>
                    </q-card-section>
                  </q-card>
                  <q-radio 
                    v-model="resolutionChoices[fieldConflict.field]" 
                    val="server" 
                    label="使用伺服器版本"
                    color="positive"
                    class="q-mt-sm"
                    :disable="fieldConflict.canAutoMerge && autoMergeEnabled"
                  />
                </div>

                <!-- Auto Merge (if applicable) -->
                <div v-if="fieldConflict.canAutoMerge" class="col">
                  <q-card flat class="bg-purple-1">
                    <q-card-section class="q-pa-sm">
                      <div class="text-caption text-purple q-mb-xs">自動合併</div>
                      <div class="field-value">
                        {{ formatFieldValue(getMergedValue(fieldConflict), fieldConflict.field) }}
                      </div>
                    </q-card-section>
                  </q-card>
                  <q-radio 
                    v-model="resolutionChoices[fieldConflict.field]" 
                    val="merge" 
                    label="自動合併"
                    color="purple"
                    class="q-mt-sm"
                  />
                </div>
              </div>

              <!-- Custom Input (for manual editing) -->
              <div v-if="resolutionChoices[fieldConflict.field] === 'custom'" class="q-mt-md">
                <q-input
                  v-model="customValues[fieldConflict.field]"
                  :label="`自訂 ${getFieldLabel(fieldConflict.field)}`"
                  outlined
                  :type="getInputType(fieldConflict.field)"
                  :rows="getInputType(fieldConflict.field) === 'textarea' ? 3 : undefined"
                />
              </div>

              <div class="row q-mt-sm">
                <q-btn
                  flat
                  size="sm"
                  icon="edit"
                  label="自訂值"
                  @click="enableCustomEdit(fieldConflict.field, fieldConflict.localValue)"
                />
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- Auto-merge toggle -->
        <q-separator class="q-my-md" />
        <div class="row items-center">
          <q-toggle
            v-model="autoMergeEnabled"
            label="自動合併所有可合併的欄位"
            color="positive"
          />
          <q-space />
          <q-btn
            flat
            icon="auto_fix_high"
            label="應用建議解決方案"
            color="positive"
            @click="applyRecommendedResolution"
          />
        </div>
      </q-card-section>

      <q-card-actions align="right" class="q-pa-md">
        <q-btn flat label="稍後處理" @click="ignoreConflict" />
        <q-btn flat label="取消" v-close-popup />
        <q-btn
          color="primary"
          label="解決衝突"
          @click="resolveConflict"
          :loading="resolving"
          :disable="!isResolutionComplete"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useTaskStore } from 'src/stores/taskStore'
import { useQuasar } from 'quasar'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  conflict: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['update:modelValue', 'conflict-resolved', 'conflict-ignored'])

const $q = useQuasar()
const taskStore = useTaskStore()

const showDialog = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const resolving = ref(false)
const autoMergeEnabled = ref(true)
const resolutionChoices = ref({})
const customValues = ref({})

// Initialize resolution choices when conflict changes
watch(() => props.conflict, (newConflict) => {
  if (newConflict) {
    initializeResolutionChoices()
  }
}, { immediate: true })

const initializeResolutionChoices = () => {
  if (!props.conflict) return
  
  const choices = {}
  const customs = {}
  
  props.conflict.conflicts.forEach(fieldConflict => {
    if (fieldConflict.canAutoMerge && autoMergeEnabled.value) {
      choices[fieldConflict.field] = 'merge'
    } else {
      // Default to newer timestamp
      const useServer = new Date(props.conflict.serverTimestamp) > new Date(props.conflict.localTimestamp)
      choices[fieldConflict.field] = useServer ? 'server' : 'local'
    }
    customs[fieldConflict.field] = ''
  })
  
  resolutionChoices.value = choices
  customValues.value = customs
}

// Watch auto-merge toggle
watch(autoMergeEnabled, (enabled) => {
  if (props.conflict) {
    props.conflict.conflicts.forEach(fieldConflict => {
      if (fieldConflict.canAutoMerge) {
        resolutionChoices.value[fieldConflict.field] = enabled ? 'merge' : 'local'
      }
    })
  }
})

const isResolutionComplete = computed(() => {
  if (!props.conflict) return false
  return props.conflict.conflicts.every(fieldConflict => 
    resolutionChoices.value[fieldConflict.field] && 
    resolutionChoices.value[fieldConflict.field] !== ''
  )
})

// Helper methods
const getEntityLabel = (entityType) => {
  return entityType === 'task' ? '任務' : '專案'
}

const getEntityTitle = (conflict) => {
  if (conflict.entityType === 'task') {
    return conflict.localData.title || conflict.serverData.title || '未知任務'
  }
  return conflict.localData.name || conflict.serverData.name || '未知專案'
}

const formatTimestamp = (timestamp) => {
  if (!timestamp) return '無時間記錄'
  return new Date(timestamp).toLocaleString('zh-TW')
}

const getFieldLabel = (field) => {
  const labels = {
    title: '標題',
    description: '描述',
    status: '狀態',
    priority: '優先級',
    assignee: '負責人',
    startTime: '開始時間',
    endTime: '結束時間',
    tags: '標籤',
    dependencies: '依賴關係',
    parentId: '父任務',
    name: '名稱',
    settings: '設定'
  }
  return labels[field] || field
}

const getFieldIcon = (field) => {
  const icons = {
    title: 'title',
    description: 'description',
    status: 'flag',
    priority: 'priority_high',
    assignee: 'person',
    startTime: 'schedule',
    endTime: 'event',
    tags: 'local_offer',
    dependencies: 'device_hub',
    parentId: 'account_tree',
    name: 'badge',
    settings: 'settings'
  }
  return icons[field] || 'info'
}

const getInputType = (field) => {
  if (field === 'description') return 'textarea'
  return 'text'
}

const formatFieldValue = (value, field) => {
  if (value === null || value === undefined) return '無'
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(', ') : '無'
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2)
  }
  return String(value)
}

const getMergedValue = (fieldConflict) => {
  if (fieldConflict.field === 'tags' && Array.isArray(fieldConflict.localValue) && Array.isArray(fieldConflict.serverValue)) {
    return [...new Set([...fieldConflict.localValue, ...fieldConflict.serverValue])]
  }
  return fieldConflict.localValue
}

const enableCustomEdit = (field, defaultValue) => {
  resolutionChoices.value[field] = 'custom'
  customValues.value[field] = formatFieldValue(defaultValue, field)
}

const applyRecommendedResolution = () => {
  autoMergeEnabled.value = true
  initializeResolutionChoices()
}

const buildResolutionData = () => {
  const resolvedData = { ...props.conflict.localData }
  
  props.conflict.conflicts.forEach(fieldConflict => {
    const choice = resolutionChoices.value[fieldConflict.field]
    
    switch (choice) {
      case 'local':
        resolvedData[fieldConflict.field] = fieldConflict.localValue
        break
      case 'server':
        resolvedData[fieldConflict.field] = fieldConflict.serverValue
        break
      case 'merge':
        resolvedData[fieldConflict.field] = getMergedValue(fieldConflict)
        break
      case 'custom':
        const customValue = customValues.value[fieldConflict.field]
        // Parse custom value based on field type
        if (fieldConflict.field === 'tags') {
          resolvedData[fieldConflict.field] = customValue.split(',').map(tag => tag.trim()).filter(tag => tag)
        } else {
          resolvedData[fieldConflict.field] = customValue
        }
        break
    }
  })
  
  return resolvedData
}

const resolveConflict = async () => {
  if (!props.conflict) return
  
  resolving.value = true
  
  try {
    const resolutionData = buildResolutionData()
    
    // Create resolution object
    const resolution = {
      data: resolutionData,
      type: 'manual',
      choices: { ...resolutionChoices.value },
      resolvedBy: taskStore.currentUser?.id || 'unknown',
      resolvedAt: new Date().toISOString()
    }
    
    // Apply resolution through store
    taskStore.resolveConflict(props.conflict.id, resolution)
    
    emit('conflict-resolved', {
      conflict: props.conflict,
      resolution
    })
    
    $q.notify({
      type: 'positive',
      message: '衝突已成功解決',
      position: 'top'
    })
    
    showDialog.value = false
    
  } catch (error) {
    console.error('Failed to resolve conflict:', error)
    $q.notify({
      type: 'negative',
      message: `解決衝突失敗: ${error.message}`,
      position: 'top'
    })
  } finally {
    resolving.value = false
  }
}

const ignoreConflict = () => {
  if (!props.conflict) return
  
  // Mark conflict as ignored (we can implement this later)
  emit('conflict-ignored', props.conflict)
  
  $q.notify({
    type: 'info',
    message: '衝突已標記為稍後處理',
    position: 'top'
  })
  
  showDialog.value = false
}
</script>

<style scoped>
.conflict-field-card {
  border-radius: 8px;
  border: 1px solid #e0e0e0;
}

.field-value {
  font-family: 'Courier New', monospace;
  font-size: 0.9em;
  line-height: 1.4;
  max-height: 120px;
  overflow-y: auto;
  word-break: break-word;
}

.q-radio {
  margin-top: 8px;
}

.q-card {
  border-radius: 8px;
}
</style>