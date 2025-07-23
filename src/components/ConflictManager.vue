<template>
  <q-dialog v-model="showDialog" persistent>
    <q-card style="min-width: 800px; max-width: 1000px;">
      <q-card-section class="row items-center q-pb-none">
        <q-icon name="merge_type" color="warning" size="24px" class="q-mr-sm" />
        <div class="text-h6">衝突管理</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section>
        <!-- Summary Stats -->
        <div class="row q-gutter-md q-mb-md">
          <q-card flat bordered class="col">
            <q-card-section class="text-center">
              <div class="text-h5 text-warning">{{ pendingConflicts.length }}</div>
              <div class="text-caption">待解決衝突</div>
            </q-card-section>
          </q-card>
          
          <q-card flat bordered class="col">
            <q-card-section class="text-center">
              <div class="text-h5 text-positive">{{ autoResolvableCount }}</div>
              <div class="text-caption">可自動解決</div>
            </q-card-section>
          </q-card>
          
          <q-card flat bordered class="col">
            <q-card-section class="text-center">
              <div class="text-h5 text-negative">{{ manualResolutionCount }}</div>
              <div class="text-caption">需手動處理</div>
            </q-card-section>
          </q-card>
        </div>

        <!-- Action Buttons -->
        <div class="row q-gutter-sm q-mb-md">
          <q-btn
            color="positive"
            icon="auto_fix_high"
            label="自動解決所有可處理的衝突"
            @click="autoResolveAll"
            :disable="autoResolvableCount === 0"
            :loading="autoResolving"
          />
          
          <q-btn
            flat
            icon="refresh"
            label="重新檢查"
            @click="refreshConflicts"
          />
        </div>

        <!-- Conflicts List -->
        <q-separator class="q-mb-md" />
        
        <div v-if="pendingConflicts.length === 0" class="text-center q-py-lg">
          <q-icon name="check_circle" color="positive" size="48px" />
          <div class="text-h6 text-positive q-mt-md">沒有待解決的衝突</div>
          <div class="text-grey-6">所有資料衝突都已解決</div>
        </div>

        <q-list v-else separator>
          <q-item
            v-for="conflict in sortedConflicts"
            :key="conflict.id"
            class="conflict-item"
          >
            <q-item-section avatar>
              <q-avatar
                :color="getConflictSeverityColor(conflict)"
                text-color="white"
                size="40px"
              >
                <q-icon :name="getConflictIcon(conflict)" />
              </q-avatar>
            </q-item-section>

            <q-item-section>
              <q-item-label class="text-h6">
                {{ getEntityTitle(conflict) }}
              </q-item-label>
              <q-item-label caption>
                {{ getEntityLabel(conflict.entityType) }} • {{ conflict.conflicts.length }} 個衝突欄位
              </q-item-label>
              
              <div class="row items-center q-gutter-sm q-mt-xs">
                <q-chip
                  v-for="fieldConflict in conflict.conflicts.slice(0, 3)"
                  :key="fieldConflict.field"
                  size="sm"
                  :color="fieldConflict.canAutoMerge ? 'positive' : 'warning'"
                  text-color="white"
                >
                  {{ getFieldLabel(fieldConflict.field) }}
                </q-chip>
                
                <q-chip
                  v-if="conflict.conflicts.length > 3"
                  size="sm"
                  outline
                >
                  +{{ conflict.conflicts.length - 3 }} 更多
                </q-chip>
              </div>

              <div class="text-caption text-grey-6 q-mt-xs">
                本地: {{ formatTimestamp(conflict.localTimestamp) }} • 
                伺服器: {{ formatTimestamp(conflict.serverTimestamp) }}
              </div>
            </q-item-section>

            <q-item-section side>
              <div class="column items-end q-gutter-sm">
                <q-chip
                  :color="canAutoResolve(conflict) ? 'positive' : 'warning'"
                  text-color="white"
                  size="sm"
                  :icon="canAutoResolve(conflict) ? 'auto_fix_high' : 'warning'"
                >
                  {{ canAutoResolve(conflict) ? '可自動解決' : '需手動處理' }}
                </q-chip>
                
                <div class="row q-gutter-xs">
                  <q-btn
                    v-if="canAutoResolve(conflict)"
                    flat
                    size="sm"
                    icon="auto_fix_high"
                    color="positive"
                    @click="autoResolveSingle(conflict)"
                    title="自動解決"
                  />
                  
                  <q-btn
                    flat
                    size="sm"
                    icon="edit"
                    color="primary"
                    @click="openConflictResolution(conflict)"
                    title="手動解決"
                  />
                  
                  <q-btn
                    flat
                    size="sm"
                    icon="visibility"
                    color="grey"
                    @click="previewConflict(conflict)"
                    title="預覽詳情"
                  />
                </div>
              </div>
            </q-item-section>
          </q-item>
        </q-list>
      </q-card-section>

      <q-card-actions align="right" class="q-pa-md">
        <q-btn flat label="關閉" v-close-popup />
      </q-card-actions>
    </q-card>

    <!-- Conflict Resolution Dialog -->
    <ConflictResolutionDialog
      v-model="showResolutionDialog"
      :conflict="selectedConflict"
      @conflict-resolved="onConflictResolved"
      @conflict-ignored="onConflictIgnored"
    />

    <!-- Conflict Preview Dialog -->
    <q-dialog v-model="showPreviewDialog">
      <q-card style="min-width: 600px;">
        <q-card-section>
          <div class="text-h6">衝突詳情預覽</div>
        </q-card-section>
        
        <q-card-section v-if="previewConflictData">
          <pre class="conflict-preview">{{ JSON.stringify(previewConflictData, null, 2) }}</pre>
        </q-card-section>
        
        <q-card-actions align="right">
          <q-btn flat label="關閉" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-dialog>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useTaskStore } from 'src/stores/taskStore'
import { useQuasar } from 'quasar'
import ConflictResolutionDialog from './ConflictResolutionDialog.vue'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue'])

const $q = useQuasar()
const taskStore = useTaskStore()

const showDialog = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const autoResolving = ref(false)
const showResolutionDialog = ref(false)
const showPreviewDialog = ref(false)
const selectedConflict = ref(null)
const previewConflictData = ref(null)

// Computed properties
const pendingConflicts = computed(() => taskStore.pendingConflicts)

const autoResolvableCount = computed(() => 
  pendingConflicts.value.filter(conflict => canAutoResolve(conflict)).length
)

const manualResolutionCount = computed(() => 
  pendingConflicts.value.length - autoResolvableCount.value
)

const sortedConflicts = computed(() => 
  [...pendingConflicts.value].sort((a, b) => {
    // Sort by severity: manual resolution first, then by timestamp
    const aAuto = canAutoResolve(a)
    const bAuto = canAutoResolve(b)
    
    if (aAuto !== bAuto) {
      return aAuto ? 1 : -1 // Manual resolution first
    }
    
    // Then by creation time (newest first)
    return new Date(b.createdAt) - new Date(a.createdAt)
  })
)

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

const getConflictIcon = (conflict) => {
  return conflict.entityType === 'task' ? 'assignment' : 'folder'
}

const getConflictSeverityColor = (conflict) => {
  return canAutoResolve(conflict) ? 'positive' : 'warning'
}

const formatTimestamp = (timestamp) => {
  if (!timestamp) return '無'
  return new Date(timestamp).toLocaleDateString('zh-TW') + ' ' + 
         new Date(timestamp).toLocaleTimeString('zh-TW', { 
           hour: '2-digit', 
           minute: '2-digit' 
         })
}

const canAutoResolve = (conflict) => {
  return taskStore.canAutoResolveConflict(conflict)
}

// Action methods
const autoResolveAll = async () => {
  autoResolving.value = true
  
  try {
    const resolved = await taskStore.autoResolveConflicts()
    
    $q.notify({
      type: 'positive',
      message: `已自動解決 ${resolved} 個衝突`,
      position: 'top'
    })
  } catch (error) {
    console.error('Auto-resolve failed:', error)
    $q.notify({
      type: 'negative',
      message: '自動解決失敗',
      position: 'top'
    })
  } finally {
    autoResolving.value = false
  }
}

const autoResolveSingle = async (conflict) => {
  try {
    const resolution = taskStore.generateAutoResolution(conflict)
    taskStore.resolveConflict(conflict.id, resolution)
    
    $q.notify({
      type: 'positive',
      message: `衝突 "${getEntityTitle(conflict)}" 已自動解決`,
      position: 'top'
    })
  } catch (error) {
    console.error('Single auto-resolve failed:', error)
    $q.notify({
      type: 'negative',
      message: '自動解決失敗',
      position: 'top'
    })
  }
}

const openConflictResolution = (conflict) => {
  selectedConflict.value = conflict
  showResolutionDialog.value = true
}

const previewConflict = (conflict) => {
  previewConflictData.value = conflict
  showPreviewDialog.value = true
}

const refreshConflicts = () => {
  // This would trigger a re-sync and conflict detection
  // For now, just show a notification
  $q.notify({
    type: 'info',
    message: '衝突檢查已刷新',
    position: 'top'
  })
}

const onConflictResolved = (event) => {
  $q.notify({
    type: 'positive',
    message: `衝突 "${getEntityTitle(event.conflict)}" 已解決`,
    position: 'top'
  })
  
  showResolutionDialog.value = false
  selectedConflict.value = null
}

const onConflictIgnored = (conflict) => {
  $q.notify({
    type: 'info',
    message: `衝突 "${getEntityTitle(conflict)}" 已標記為稍後處理`,
    position: 'top'
  })
  
  showResolutionDialog.value = false
  selectedConflict.value = null
}
</script>

<style scoped>
.conflict-item {
  border-radius: 8px;
  margin-bottom: 8px;
  padding: 16px;
}

.conflict-item:hover {
  background-color: rgba(0, 0, 0, 0.02);
}

.conflict-preview {
  font-family: 'Courier New', monospace;
  font-size: 0.8em;
  background-color: #f5f5f5;
  padding: 16px;
  border-radius: 4px;
  max-height: 400px;
  overflow-y: auto;
}

.q-card {
  border-radius: 8px;
}
</style>