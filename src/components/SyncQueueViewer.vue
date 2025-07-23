<template>
  <q-dialog v-model="showDialog" persistent>
    <q-card style="min-width: 600px; max-width: 800px;">
      <q-card-section class="row items-center q-pb-none">
        <q-icon name="sync" color="primary" size="24px" class="q-mr-sm" />
        <div class="text-h6">同步佇列管理</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section>
        <!-- Connection Status -->
        <div class="row q-gutter-md q-mb-md">
          <q-chip
            :icon="connectionStatusIcon"
            :color="connectionStatusColor"
            text-color="white"
          >
            {{ taskStore.connectionStatus }}
          </q-chip>
          
          <q-chip
            v-if="taskStore.socketReconnectAttempts > 0"
            icon="refresh"
            color="orange"
            text-color="white"
          >
            重連嘗試: {{ taskStore.socketReconnectAttempts }}/{{ taskStore.socketMaxReconnectAttempts }}
          </q-chip>

          <q-space />
          
          <q-btn
            flat
            icon="refresh"
            label="手動重試"
            color="primary"
            @click="retryFailedSync"
            :disable="failedItems.length === 0"
          />
        </div>

        <!-- Summary Stats -->
        <div class="row q-gutter-md q-mb-md">
          <q-card flat bordered class="col">
            <q-card-section class="text-center">
              <div class="text-h5 text-primary">{{ pendingItems.length }}</div>
              <div class="text-caption">待同步</div>
            </q-card-section>
          </q-card>
          
          <q-card flat bordered class="col">
            <q-card-section class="text-center">
              <div class="text-h5 text-orange">{{ syncingItems.length }}</div>
              <div class="text-caption">同步中</div>
            </q-card-section>
          </q-card>
          
          <q-card flat bordered class="col">
            <q-card-section class="text-center">
              <div class="text-h5 text-negative">{{ failedItems.length }}</div>
              <div class="text-caption">失敗</div>
            </q-card-section>
          </q-card>
        </div>

        <!-- Queue Items List -->
        <q-separator class="q-mb-md" />
        
        <div class="text-subtitle1 q-mb-sm">佇列項目</div>
        
        <q-list v-if="syncQueue.length > 0" separator>
          <q-item
            v-for="item in sortedQueueItems"
            :key="item.id"
            class="queue-item"
          >
            <q-item-section avatar>
              <q-icon
                :name="getItemIcon(item)"
                :color="getItemColor(item)"
                size="24px"
              />
            </q-item-section>

            <q-item-section>
              <q-item-label>
                {{ getActionLabel(item.action) }} {{ getEntityLabel(item.entity) }}
              </q-item-label>
              <q-item-label caption>
                {{ getItemDescription(item) }}
              </q-item-label>
              <q-item-label caption class="text-grey-6">
                {{ formatTimestamp(item.timestamp) }}
              </q-item-label>
            </q-item-section>

            <q-item-section side>
              <div class="column items-end">
                <q-chip
                  :color="getStatusColor(item.status)"
                  text-color="white"
                  size="sm"
                >
                  {{ getStatusLabel(item.status) }}
                </q-chip>
                
                <div v-if="item.retryCount > 0" class="text-caption text-orange q-mt-xs">
                  重試: {{ item.retryCount }} 次
                </div>
              </div>
            </q-item-section>

            <q-item-section side v-if="item.status === 'failed'">
              <q-btn
                flat
                round
                icon="refresh"
                color="primary"
                size="sm"
                @click="retryItem(item)"
                title="重試此項目"
              />
            </q-item-section>
          </q-item>
        </q-list>

        <div v-else class="text-center q-py-lg">
          <q-icon name="check_circle" color="positive" size="48px" />
          <div class="text-h6 text-positive q-mt-md">同步佇列為空</div>
          <div class="text-grey-6">所有變更都已同步完成</div>
        </div>
      </q-card-section>

      <q-card-actions align="right" class="q-pa-md">
        <q-btn flat label="關閉" v-close-popup />
        <q-btn
          v-if="failedItems.length > 0"
          color="negative"
          label="清除失敗項目"
          @click="clearFailedItems"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, computed } from 'vue'
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

// Computed properties for queue analysis
const syncQueue = computed(() => taskStore.syncQueue || [])

const pendingItems = computed(() => 
  syncQueue.value.filter(item => item.status === 'pending')
)

const syncingItems = computed(() => 
  syncQueue.value.filter(item => item.status === 'syncing')
)

const failedItems = computed(() => 
  syncQueue.value.filter(item => item.status === 'failed')
)

const sortedQueueItems = computed(() => 
  [...syncQueue.value].sort((a, b) => {
    // Sort by status priority: failed > syncing > pending
    const statusPriority = { failed: 3, syncing: 2, pending: 1 }
    const aPriority = statusPriority[a.status] || 0
    const bPriority = statusPriority[b.status] || 0
    
    if (aPriority !== bPriority) {
      return bPriority - aPriority
    }
    
    // Then by timestamp (newest first)
    return new Date(b.timestamp) - new Date(a.timestamp)
  })
)

const connectionStatusIcon = computed(() => {
  return taskStore.socketConnected ? 'wifi' : 'wifi_off'
})

const connectionStatusColor = computed(() => {
  return taskStore.socketConnected ? 'positive' : 'negative'
})

// Helper methods
const getItemIcon = (item) => {
  const icons = {
    create: 'add',
    update: 'edit',
    delete: 'delete'
  }
  return icons[item.action] || 'sync'
}

const getItemColor = (item) => {
  const colors = {
    pending: 'grey',
    syncing: 'primary',
    failed: 'negative',
    success: 'positive'
  }
  return colors[item.status] || 'grey'
}

const getActionLabel = (action) => {
  const labels = {
    create: '建立',
    update: '更新',
    delete: '刪除'
  }
  return labels[action] || action
}

const getEntityLabel = (entity) => {
  const labels = {
    task: '任務',
    project: '專案'
  }
  return labels[entity] || entity
}

const getStatusColor = (status) => {
  const colors = {
    pending: 'grey',
    syncing: 'primary',
    failed: 'negative',
    success: 'positive'
  }
  return colors[status] || 'grey'
}

const getStatusLabel = (status) => {
  const labels = {
    pending: '等待中',
    syncing: '同步中',
    failed: '失敗',
    success: '成功'
  }
  return labels[status] || status
}

const getItemDescription = (item) => {
  if (item.data) {
    if (item.entity === 'task' && item.data.title) {
      return item.data.title
    }
    if (item.entity === 'project' && item.data.name) {
      return item.data.name
    }
  }
  return `${item.entity} ID: ${item.entityId || 'unknown'}`
}

const formatTimestamp = (timestamp) => {
  if (!timestamp) return '無時間'
  const date = new Date(timestamp)
  return date.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// Action methods
const retryFailedSync = async () => {
  if (failedItems.value.length === 0) return
  
  $q.loading.show({
    message: '重試同步中...'
  })
  
  try {
    await taskStore.retryFailedSync()
    $q.notify({
      type: 'positive',
      message: `已重試 ${failedItems.value.length} 個失敗項目`,
      position: 'top'
    })
  } catch (error) {
    $q.notify({
      type: 'negative',
      message: '重試同步失敗',
      position: 'top'
    })
  } finally {
    $q.loading.hide()
  }
}

const retryItem = async (item) => {
  try {
    await taskStore.retrySyncItem(item.id)
    $q.notify({
      type: 'positive',
      message: '項目已重新加入同步佇列',
      position: 'top'
    })
  } catch (error) {
    $q.notify({
      type: 'negative',
      message: '重試項目失敗',
      position: 'top'
    })
  }
}

const clearFailedItems = () => {
  $q.dialog({
    title: '確認清除',
    message: '確定要清除所有失敗的同步項目嗎？這些變更將會遺失。',
    cancel: true,
    persistent: true,
    color: 'negative'
  }).onOk(() => {
    taskStore.clearFailedSyncItems()
    $q.notify({
      type: 'info',
      message: '已清除失敗的同步項目',
      position: 'top'
    })
  })
}
</script>

<style scoped>
.queue-item {
  border-radius: 8px;
  margin-bottom: 4px;
}

.queue-item:hover {
  background-color: rgba(0, 0, 0, 0.02);
}

.q-card {
  border-radius: 8px;
}
</style>