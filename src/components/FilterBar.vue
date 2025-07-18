<template>
  <q-card class="filter-bar q-pa-xs">
    <div class="row q-gutter-xs items-center">
      <!-- Status Filter -->
      <div class="col-12 col-sm-6 col-md-auto">
        <q-select
          v-model="localFilters.status"
          :options="statusOptions"
          label="狀態篩選"
          outlined
          dense
          size="sm"
          clearable
          emit-value
          map-options
          style="min-width: 100px"
        >
          <template v-slot:prepend>
            <q-icon name="assignment" />
          </template>
        </q-select>
      </div>

      <!-- Priority Filter -->
      <div class="col-12 col-sm-6 col-md-auto">
        <q-select
          v-model="localFilters.priority"
          :options="priorityOptions"
          label="優先級篩選"
          outlined
          dense
          size="sm"
          clearable
          emit-value
          map-options
          style="min-width: 100px"
        >
          <template v-slot:prepend>
            <q-icon name="priority_high" />
          </template>
        </q-select>
      </div>

      <!-- Tags Filter -->
      <div class="col-12 col-md-auto" style="min-width: 160px">
        <q-select
          v-model="localFilters.tags"
          :options="tagOptions"
          label="標籤篩選"
          outlined
          dense
          size="sm"
          multiple
          use-chips
          clearable
        >
          <template v-slot:prepend>
            <q-icon name="label" />
          </template>
        </q-select>
      </div>

      <!-- Assignee Filter -->
      <div class="col-12 col-sm-6 col-md-auto">
        <q-input
          v-model="localFilters.assignee"
          label="執行人篩選"
          outlined
          dense
          clearable
          style="min-width: 120px"
        >
          <template v-slot:prepend>
            <q-icon name="person" />
          </template>
        </q-input>
      </div>

      <!-- Date Range Filter -->
      <div class="col-12 col-md-auto">
        <q-btn
          :label="dateRangeLabel"
          icon="date_range"
          outline
          size="sm"
          no-caps
          @click="showDatePicker = true"
        />

        <q-dialog v-model="showDatePicker">
          <q-card>
            <q-card-section class="q-pb-none">
              <div class="text-h6">選擇日期範圍</div>
            </q-card-section>

            <q-card-section>
              <div class="row q-gutter-xs">
                <div class="col">
                  <q-input
                    v-model="tempDateRange.start"
                    label="開始日期"
                    type="date"
                    outlined
                  />
                </div>
                <div class="col">
                  <q-input
                    v-model="tempDateRange.end"
                    label="結束日期"
                    type="date"
                    outlined
                  />
                </div>
              </div>
            </q-card-section>

            <q-card-actions align="right">
              <q-btn flat label="取消" v-close-popup />
              <q-btn flat label="清除" @click="clearDateRange" />
              <q-btn unelevated label="確定" color="primary" @click="applyDateRange" />
            </q-card-actions>
          </q-card>
        </q-dialog>
      </div>

      <!-- Quick Filter Buttons -->
      <div class="col-12 col-md-auto">
        <q-btn-group outline>
          <q-btn
            :color="quickFilter === 'today' ? 'primary' : 'grey-7'"
            label="今日"
            size="sm"
            no-caps
            @click="setQuickFilter('today')"
          />
          <q-btn
            :color="quickFilter === 'week' ? 'primary' : 'grey-7'"
            label="本週"
            size="sm"
            no-caps
            @click="setQuickFilter('week')"
          />
          <q-btn
            :color="quickFilter === 'overdue' ? 'primary' : 'grey-7'"
            label="逾期"
            size="sm"
            no-caps
            @click="setQuickFilter('overdue')"
          />
        </q-btn-group>
      </div>

      <!-- Clear All Filters -->
      <div class="col-12 col-md-auto">
        <q-btn
          icon="clear_all"
          label="清除篩選"
          flat
          size="sm"
          color="grey-7"
          @click="clearAllFilters"
        />
      </div>

      <!-- Search -->
      <div class="col-12 col-md-auto flex-grow">
        <q-input
          v-model="searchText"
          label="搜尋任務"
          outlined
          dense
          clearable
          debounce="300"
        >
          <template v-slot:prepend>
            <q-icon name="search" />
          </template>
        </q-input>
      </div>
    </div>

    <!-- Active Filters Display -->
    <div v-if="hasActiveFilters" class="row q-mt-xs q-gutter-xs">
      <div class="text-caption text-grey-7 q-mr-xs">活躍篩選：</div>

      <q-chip
        v-if="localFilters.status"
        removable
        color="blue"
        text-color="white"
        @remove="localFilters.status = null"
      >
        狀態: {{ getStatusLabel(localFilters.status) }}
      </q-chip>

      <q-chip
        v-if="localFilters.priority"
        removable
        color="orange"
        text-color="white"
        @remove="localFilters.priority = null"
      >
        優先級: {{ getPriorityLabel(localFilters.priority) }}
      </q-chip>

      <q-chip
        v-for="tag in localFilters.tags"
        :key="tag"
        removable
        color="purple"
        text-color="white"
        @remove="removeTag(tag)"
      >
        標籤: {{ tag }}
      </q-chip>

      <q-chip
        v-if="localFilters.assignee"
        removable
        color="green"
        text-color="white"
        @remove="localFilters.assignee = null"
      >
        執行人: {{ localFilters.assignee }}
      </q-chip>

      <q-chip
        v-if="localFilters.dateRange"
        removable
        color="teal"
        text-color="white"
        @remove="localFilters.dateRange = null"
      >
        日期: {{ formatDateRange(localFilters.dateRange) }}
      </q-chip>

      <q-chip
        v-if="searchText"
        removable
        color="grey-7"
        text-color="white"
        @remove="searchText = ''"
      >
        搜尋: {{ searchText }}
      </q-chip>
    </div>

    <!-- Filter Summary -->
    <div v-if="filteredCount !== totalCount" class="q-mt-xs text-caption text-grey-6">
      顯示 {{ filteredCount }} / {{ totalCount }} 個任務
    </div>
  </q-card>
</template>

<script>
import { ref, computed, watch } from 'vue'
import { useTaskStore } from 'src/stores/taskStore'

export default {
  name: 'FilterBar',

  emits: ['filter-change'],

  setup(props, { emit }) {
    const taskStore = useTaskStore()
    const showDatePicker = ref(false)
    const quickFilter = ref(null)
    const searchText = ref('')

    // Temporary date range for picker
    const tempDateRange = ref({
      start: '',
      end: ''
    })

    // Local filters that sync with store
    const localFilters = computed({
      get: () => taskStore.filters,
      set: (newFilters) => {
        Object.keys(newFilters).forEach(key => {
          taskStore.setFilter(key, newFilters[key])
        })
      }
    })

    // Options
    const statusOptions = [
      { label: '待辦', value: 'todo' },
      { label: '進行中', value: 'in_progress' },
      { label: '已完成', value: 'done' },
      { label: '阻塞', value: 'blocked' }
    ]

    const priorityOptions = [
      { label: '低', value: 'low' },
      { label: '中', value: 'medium' },
      { label: '高', value: 'high' }
    ]

    const tagOptions = computed(() => taskStore.tags)

    // Computed properties
    const dateRangeLabel = computed(() => {
      if (!localFilters.value.dateRange) return '日期範圍'

      const { start, end } = localFilters.value.dateRange
      const startDate = new Date(start).toLocaleDateString('zh-TW')
      const endDate = new Date(end).toLocaleDateString('zh-TW')

      return `${startDate} - ${endDate}`
    })

    const hasActiveFilters = computed(() => {
      return localFilters.value.status ||
             localFilters.value.priority ||
             (localFilters.value.tags && localFilters.value.tags.length > 0) ||
             localFilters.value.assignee ||
             localFilters.value.dateRange ||
             searchText.value
    })

    const filteredCount = computed(() => {
      let filtered = [...taskStore.tasks]

      // Apply all filters
      if (localFilters.value.status) {
        filtered = filtered.filter(task => task.status === localFilters.value.status)
      }

      if (localFilters.value.priority) {
        filtered = filtered.filter(task => task.priority === localFilters.value.priority)
      }

      if (localFilters.value.tags && localFilters.value.tags.length > 0) {
        filtered = filtered.filter(task =>
          task.tags.some(tag => localFilters.value.tags.includes(tag))
        )
      }

      if (localFilters.value.assignee) {
        filtered = filtered.filter(task =>
          task.assignee.toLowerCase().includes(localFilters.value.assignee.toLowerCase())
        )
      }

      if (localFilters.value.dateRange) {
        const { start, end } = localFilters.value.dateRange
        filtered = filtered.filter(task => {
          if (!task.startTime) return false
          const taskDate = new Date(task.startTime)
          return taskDate >= new Date(start) && taskDate <= new Date(end)
        })
      }

      if (searchText.value) {
        const search = searchText.value.toLowerCase()
        filtered = filtered.filter(task =>
          task.title.toLowerCase().includes(search) ||
          task.description.toLowerCase().includes(search)
        )
      }

      return filtered.length
    })

    const totalCount = computed(() => taskStore.tasks.length)

    // Methods
    const getStatusLabel = (status) => {
      const option = statusOptions.find(opt => opt.value === status)
      return option ? option.label : status
    }

    const getPriorityLabel = (priority) => {
      const option = priorityOptions.find(opt => opt.value === priority)
      return option ? option.label : priority
    }

    const removeTag = (tag) => {
      const newTags = localFilters.value.tags.filter(t => t !== tag)
      taskStore.setFilter('tags', newTags)
    }

    const clearDateRange = () => {
      tempDateRange.value = { start: '', end: '' }
      taskStore.setFilter('dateRange', null)
      showDatePicker.value = false
    }

    const applyDateRange = () => {
      if (tempDateRange.value.start && tempDateRange.value.end) {
        taskStore.setFilter('dateRange', {
          start: tempDateRange.value.start,
          end: tempDateRange.value.end
        })
      }
      showDatePicker.value = false
    }

    const setQuickFilter = (filter) => {
      if (quickFilter.value === filter) {
        // Toggle off
        quickFilter.value = null
        taskStore.setFilter('dateRange', null)
        return
      }

      quickFilter.value = filter
      const today = new Date()
      let start, end

      switch (filter) {
        case 'today': {
          start = new Date(today)
          end = new Date(today)
          break
        }

        case 'week': {
          const startOfWeek = new Date(today)
          startOfWeek.setDate(today.getDate() - today.getDay())
          const endOfWeek = new Date(startOfWeek)
          endOfWeek.setDate(startOfWeek.getDate() + 6)
          start = startOfWeek
          end = endOfWeek
          break
        }

        case 'overdue':
          // Show tasks that are overdue (end time < now and not done)
          taskStore.setFilter('dateRange', null)
          // This would need custom logic in the store
          return
      }

      if (start && end) {
        taskStore.setFilter('dateRange', {
          start: start.toISOString().split('T')[0],
          end: end.toISOString().split('T')[0]
        })
      }
    }

    const clearAllFilters = () => {
      taskStore.clearFilters()
      searchText.value = ''
      quickFilter.value = null
    }

    const formatDateRange = (dateRange) => {
      if (!dateRange) return ''

      const start = new Date(dateRange.start).toLocaleDateString('zh-TW')
      const end = new Date(dateRange.end).toLocaleDateString('zh-TW')

      return `${start} - ${end}`
    }

    // Watch for filter changes and emit
    watch([localFilters, searchText], () => {
      emit('filter-change', {
        filters: localFilters.value,
        searchText: searchText.value
      })
    }, { deep: true })

    // Initialize date picker when opening
    watch(showDatePicker, (newVal) => {
      if (newVal && localFilters.value.dateRange) {
        tempDateRange.value = {
          start: localFilters.value.dateRange.start,
          end: localFilters.value.dateRange.end
        }
      }
    })

    return {
      showDatePicker,
      quickFilter,
      searchText,
      tempDateRange,
      localFilters,
      statusOptions,
      priorityOptions,
      tagOptions,
      dateRangeLabel,
      hasActiveFilters,
      filteredCount,
      totalCount,
      getStatusLabel,
      getPriorityLabel,
      removeTag,
      clearDateRange,
      applyDateRange,
      setQuickFilter,
      clearAllFilters,
      formatDateRange
    }
  }
}
</script>

<style scoped>
.filter-bar {
  background: #fafafa;
  border: 1px solid #e0e0e0;
}

.flex-grow {
  flex-grow: 1;
}

/* Compact chip styling */
.filter-bar .q-chip {
  font-size: 11px;
  padding: 2px 6px;
  height: 20px;
  min-height: 20px;
}

.filter-bar .q-chip .q-chip__content {
  min-height: inherit;
}

.filter-bar .q-chip .q-icon {
  font-size: 14px;
}

/* Compact form controls */
.filter-bar .q-field {
  font-size: 12px;
}

.filter-bar .q-field--dense .q-field__control {
  height: 32px;
}

.filter-bar .q-btn {
  font-size: 11px;
  padding: 4px 8px;
  min-height: 32px;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .filter-bar .row > div {
    margin-bottom: 4px;
  }

  .q-btn-group {
    width: 100%;
  }

  .q-btn-group .q-btn {
    flex: 1;
  }
}
</style>
