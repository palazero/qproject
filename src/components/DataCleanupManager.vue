<template>
  <q-dialog v-model="showDialog" persistent>
    <q-card style="min-width: 800px; max-width: 1000px;">
      <q-card-section class="row items-center q-pb-none">
        <q-icon name="cleaning_services" color="primary" size="24px" class="q-mr-sm" />
        <div class="text-h6">資料清理管理</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section>
        <q-tabs v-model="activeTab" class="text-primary">
          <q-tab name="overview" icon="dashboard" label="概覽" />
          <q-tab name="settings" icon="settings" label="設定" />
          <q-tab name="manual" icon="build" label="手動清理" />
          <q-tab name="logs" icon="history" label="清理記錄" />
        </q-tabs>

        <q-separator class="q-my-md" />

        <q-tab-panels v-model="activeTab">
          <!-- Overview Tab -->
          <q-tab-panel name="overview">
            <div class="text-h6 q-mb-md">系統狀態</div>
            
            <!-- Cleanup Statistics -->
            <div class="row q-gutter-md q-mb-lg">
              <q-card flat bordered class="col">
                <q-card-section class="text-center">
                  <div class="text-h5 text-warning">{{ cleanupStats.orphanedTasks }}</div>
                  <div class="text-caption">孤立任務</div>
                </q-card-section>
              </q-card>
              
              <q-card flat bordered class="col">
                <q-card-section class="text-center">
                  <div class="text-h5 text-orange">{{ cleanupStats.oldSyncItems }}</div>
                  <div class="text-caption">過期同步項目</div>
                </q-card-section>
              </q-card>
              
              <q-card flat bordered class="col">
                <q-card-section class="text-center">
                  <div class="text-h5 text-negative">{{ cleanupStats.oldConflicts }}</div>
                  <div class="text-caption">過期衝突記錄</div>
                </q-card-section>
              </q-card>
            </div>

            <!-- Cleanup Schedule -->
            <q-card flat bordered class="q-mb-md">
              <q-card-section>
                <div class="text-subtitle1 q-mb-sm">清理排程</div>
                
                <div class="row q-gutter-md">
                  <div class="col">
                    <q-chip 
                      :color="cleanupStats.autoCleanupEnabled ? 'positive' : 'grey'" 
                      text-color="white"
                      :icon="cleanupStats.autoCleanupEnabled ? 'schedule' : 'schedule_send'"
                    >
                      {{ cleanupStats.autoCleanupEnabled ? '自動清理已啟用' : '自動清理已停用' }}
                    </q-chip>
                  </div>
                  
                  <div class="col-auto">
                    <div class="text-caption text-grey-6">
                      上次清理: {{ formatTimestamp(cleanupStats.lastCleanupRun) }}
                    </div>
                    <div class="text-caption text-grey-6">
                      下次預定: {{ formatTimestamp(cleanupStats.nextScheduledCleanup) }}
                    </div>
                  </div>
                </div>
              </q-card-section>
            </q-card>

            <!-- Quick Actions -->
            <div class="row q-gutter-sm">
              <q-btn 
                color="primary" 
                icon="cleaning_services" 
                label="立即清理"
                @click="performQuickCleanup"
                :loading="cleanupInProgress"
                :disable="!hasItemsToCleanup"
              />
              
              <q-btn 
                flat 
                icon="refresh" 
                label="重新整理統計"
                @click="refreshStats"
              />
              
              <q-btn 
                flat 
                icon="settings" 
                label="清理設定"
                @click="activeTab = 'settings'"
              />
            </div>
          </q-tab-panel>

          <!-- Settings Tab -->
          <q-tab-panel name="settings">
            <div class="text-h6 q-mb-md">清理設定</div>
            
            <q-form class="q-gutter-md">
              <q-toggle
                v-model="localSettings.autoCleanupEnabled"
                label="啟用自動清理"
                color="positive"
              />

              <q-input
                v-model.number="localSettings.closedProjectRetentionDays"
                type="number"
                label="關閉專案保留天數"
                hint="關閉的專案在多少天後被清理"
                outlined
                dense
                :min="1"
                :max="365"
              />

              <q-input
                v-model.number="localSettings.cleanupIntervalHours"
                type="number"
                label="自動清理間隔 (小時)"
                hint="自動清理執行的頻率"
                outlined
                dense
                :min="1"
                :max="168"
              />

              <q-input
                v-model.number="localSettings.maxLogEntries"
                type="number"
                label="最大記錄條數"
                hint="保留的清理記錄數量上限"
                outlined
                dense
                :min="10"
                :max="1000"
              />

              <div class="row q-gutter-sm q-mt-md">
                <q-btn
                  color="primary"
                  label="儲存設定"
                  @click="saveSettings"
                  :loading="savingSettings"
                />
                
                <q-btn
                  flat
                  label="重設為預設值"
                  @click="resetSettings"
                />
              </div>
            </q-form>
          </q-tab-panel>

          <!-- Manual Cleanup Tab -->
          <q-tab-panel name="manual">
            <div class="text-h6 q-mb-md">手動清理</div>
            
            <q-banner class="bg-info text-white rounded-borders q-mb-md">
              <template v-slot:avatar>
                <q-icon name="info" />
              </template>
              手動清理允許您自訂清理選項並立即執行。此操作無法復原，請謹慎操作。
            </q-banner>

            <q-form class="q-gutter-md">
              <div class="text-subtitle1">清理選項</div>
              
              <q-checkbox
                v-model="manualCleanupOptions.includeOrphanedTasks"
                label="清理孤立任務"
                color="primary"
              />
              
              <q-checkbox
                v-model="manualCleanupOptions.includeOldSyncItems"
                label="清理過期同步項目"
                color="primary"
              />
              
              <q-checkbox
                v-model="manualCleanupOptions.includeOldConflicts"
                label="清理過期衝突記錄"
                color="primary"
              />

              <q-input
                v-model.number="manualCleanupOptions.customRetentionDays"
                type="number"
                label="自訂保留天數 (可選)"
                hint="覆蓋預設的保留天數設定"
                outlined
                dense
                clearable
                :min="1"
                :max="365"
              />

              <div class="row q-gutter-sm q-mt-md">
                <q-btn
                  color="negative"
                  icon="warning"
                  label="執行手動清理"
                  @click="confirmManualCleanup"
                  :loading="cleanupInProgress"
                />
                
                <q-btn
                  flat
                  icon="preview"
                  label="預覽將被清理的項目"
                  @click="previewCleanup"
                />
              </div>
            </q-form>
          </q-tab-panel>

          <!-- Logs Tab -->
          <q-tab-panel name="logs">
            <div class="text-h6 q-mb-md">清理記錄</div>
            
            <div class="row items-center q-mb-md">
              <q-space />
              <q-btn
                flat
                icon="refresh"
                label="重新整理"
                @click="refreshLogs"
              />
            </div>

            <q-list v-if="cleanupLogs.length > 0" separator>
              <q-item
                v-for="log in cleanupLogs"
                :key="log.id"
                class="cleanup-log-item"
              >
                <q-item-section avatar>
                  <q-avatar
                    :color="getLogTypeColor(log.type)"
                    text-color="white"
                    size="40px"
                  >
                    <q-icon :name="getLogTypeIcon(log)" />
                  </q-avatar>
                </q-item-section>

                <q-item-section>
                  <q-item-label class="text-h6">
                    {{ getLogTypeLabel(log.type) }}
                  </q-item-label>
                  <q-item-label caption>
                    {{ formatTimestamp(log.timestamp) }} • 由 {{ log.triggeredBy }} 觸發
                  </q-item-label>
                  
                  <div v-if="log.result" class="q-mt-xs">
                    <q-chip
                      v-if="log.result.tasksRemoved > 0"
                      size="sm"
                      color="orange"
                      text-color="white"
                    >
                      {{ log.result.tasksRemoved }} 個任務
                    </q-chip>
                    
                    <q-chip
                      v-if="log.result.syncItemsRemoved > 0"
                      size="sm"
                      color="blue"
                      text-color="white"
                    >
                      {{ log.result.syncItemsRemoved }} 個同步項目
                    </q-chip>
                    
                    <q-chip
                      v-if="log.result.conflictsRemoved > 0"
                      size="sm"
                      color="purple"
                      text-color="white"
                    >
                      {{ log.result.conflictsRemoved }} 個衝突
                    </q-chip>
                    
                    <q-chip
                      v-if="log.result.storageFreed > 0"
                      size="sm"
                      color="positive"
                      text-color="white"
                    >
                      節省 {{ formatBytes(log.result.storageFreed) }}
                    </q-chip>
                  </div>

                  <div v-if="log.error" class="text-negative q-mt-xs">
                    錯誤: {{ log.error }}
                  </div>
                </q-item-section>

                <q-item-section side>
                  <q-btn
                    flat
                    round
                    icon="more_vert"
                    @click="showLogDetails(log)"
                  />
                </q-item-section>
              </q-item>
            </q-list>

            <div v-else class="text-center q-py-lg">
              <q-icon name="history" color="grey-4" size="48px" />
              <div class="text-h6 text-grey-6 q-mt-md">沒有清理記錄</div>
              <div class="text-grey-5">清理操作記錄會顯示在這裡</div>
            </div>
          </q-tab-panel>
        </q-tab-panels>
      </q-card-section>

      <q-card-actions align="right" class="q-pa-md">
        <q-btn flat label="關閉" v-close-popup />
      </q-card-actions>
    </q-card>

    <!-- Log Details Dialog -->
    <q-dialog v-model="showLogDetailsDialog">
      <q-card style="min-width: 500px;">
        <q-card-section>
          <div class="text-h6">清理記錄詳情</div>
        </q-card-section>
        
        <q-card-section v-if="selectedLog">
          <pre class="log-details">{{ JSON.stringify(selectedLog, null, 2) }}</pre>
        </q-card-section>
        
        <q-card-actions align="right">
          <q-btn flat label="關閉" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-dialog>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useTaskStore } from 'src/stores/taskStore'
import { useQuasar } from 'quasar'

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

const activeTab = ref('overview')
const cleanupInProgress = ref(false)
const savingSettings = ref(false)
const showLogDetailsDialog = ref(false)
const selectedLog = ref(null)

// Local settings for editing
const localSettings = ref({
  autoCleanupEnabled: true,
  closedProjectRetentionDays: 7,
  cleanupIntervalHours: 24,
  maxLogEntries: 100
})

// Manual cleanup options
const manualCleanupOptions = ref({
  includeOrphanedTasks: true,
  includeOldSyncItems: true,
  includeOldConflicts: true,
  customRetentionDays: null
})

// Computed properties
const cleanupStats = computed(() => taskStore.getCleanupStats())
const cleanupLogs = computed(() => taskStore.cleanupLogs)

const hasItemsToCleanup = computed(() => {
  const stats = cleanupStats.value
  return stats.orphanedTasks > 0 || stats.oldSyncItems > 0 || stats.oldConflicts > 0
})

// Watch for dialog open to refresh data
watch(showDialog, (newValue) => {
  if (newValue) {
    refreshStats()
    loadSettings()
  }
})

// Load current settings
const loadSettings = () => {
  localSettings.value = { ...taskStore.cleanupSettings }
}

// Helper methods
const formatTimestamp = (timestamp) => {
  if (!timestamp) return '無記錄'
  return new Date(timestamp).toLocaleString('zh-TW')
}

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const getLogTypeLabel = (type) => {
  const labels = {
    automatic: '自動清理',
    manual: '手動清理'
  }
  return labels[type] || type
}

const getLogTypeColor = (type) => {
  const colors = {
    automatic: 'primary',
    manual: 'orange'
  }
  return colors[type] || 'grey'
}

const getLogTypeIcon = (log) => {
  if (log.error) return 'error'
  return log.type === 'automatic' ? 'schedule' : 'build'
}

// Action methods
const refreshStats = () => {
  // Stats are computed, so this just triggers reactivity
  $q.notify({
    type: 'info',
    message: '統計資料已重新整理',
    position: 'top'
  })
}

const refreshLogs = () => {
  $q.notify({
    type: 'info',
    message: '清理記錄已重新整理',
    position: 'top'
  })
}

const performQuickCleanup = async () => {
  if (!hasItemsToCleanup.value) {
    $q.notify({
      type: 'info',
      message: '沒有需要清理的項目',
      position: 'top'
    })
    return
  }

  $q.dialog({
    title: '確認快速清理',
    message: '這將清理所有孤立任務、過期同步項目和衝突記錄。此操作無法復原，確定要繼續嗎？',
    cancel: true,
    persistent: true,
    color: 'negative'
  }).onOk(async () => {
    cleanupInProgress.value = true
    
    try {
      const result = await taskStore.performManualCleanup()
      
      $q.notify({
        type: 'positive',
        message: `清理完成！清理了 ${result.tasksRemoved} 個任務，節省了 ${formatBytes(result.storageFreed)} 儲存空間`,
        position: 'top'
      })
    } catch (error) {
      console.error('Quick cleanup failed:', error)
      $q.notify({
        type: 'negative',
        message: `清理失敗: ${error.message}`,
        position: 'top'
      })
    } finally {
      cleanupInProgress.value = false
    }
  })
}

const saveSettings = async () => {
  savingSettings.value = true
  
  try {
    taskStore.updateCleanupSettings(localSettings.value)
    
    $q.notify({
      type: 'positive',
      message: '設定已儲存',
      position: 'top'
    })
  } catch (error) {
    $q.notify({
      type: 'negative',
      message: '儲存設定失敗',
      position: 'top'
    })
  } finally {
    savingSettings.value = false
  }
}

const resetSettings = () => {
  localSettings.value = {
    autoCleanupEnabled: true,
    closedProjectRetentionDays: 7,
    cleanupIntervalHours: 24,
    maxLogEntries: 100
  }
}

const previewCleanup = () => {
  const stats = taskStore.getCleanupStats()
  
  let message = '預覽清理結果:\n\n'
  message += `• 孤立任務: ${stats.orphanedTasks} 個\n`
  message += `• 過期同步項目: ${stats.oldSyncItems} 個\n`
  message += `• 過期衝突記錄: ${stats.oldConflicts} 個\n`
  
  $q.dialog({
    title: '清理預覽',
    message: message,
    ok: '了解'
  })
}

const confirmManualCleanup = () => {
  $q.dialog({
    title: '確認手動清理',
    message: '此操作將根據您選擇的選項清理資料。此操作無法復原，確定要繼續嗎？',
    cancel: true,
    persistent: true,
    color: 'negative'
  }).onOk(async () => {
    await performManualCleanup()
  })
}

const performManualCleanup = async () => {
  cleanupInProgress.value = true
  
  try {
    const result = await taskStore.performManualCleanup(manualCleanupOptions.value)
    
    $q.notify({
      type: 'positive',
      message: `手動清理完成！清理了 ${result.tasksRemoved} 個任務，節省了 ${formatBytes(result.storageFreed)} 儲存空間`,
      position: 'top'
    })
    
    // Switch to logs tab to show result
    activeTab.value = 'logs'
  } catch (error) {
    console.error('Manual cleanup failed:', error)
    $q.notify({
      type: 'negative',
      message: `手動清理失敗: ${error.message}`,
      position: 'top'
    })
  } finally {
    cleanupInProgress.value = false
  }
}

const showLogDetails = (log) => {
  selectedLog.value = log
  showLogDetailsDialog.value = true
}

onMounted(() => {
  loadSettings()
})
</script>

<style scoped>
.cleanup-log-item {
  border-radius: 8px;
  margin-bottom: 8px;
}

.cleanup-log-item:hover {
  background-color: rgba(0, 0, 0, 0.02);
}

.log-details {
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