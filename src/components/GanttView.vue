<template>
  <div class="gantt-wrapper">
    <!-- 甘特圖工具欄 -->
    <div class="gantt-toolbar">
      <div class="toolbar-section">
        <q-btn
          flat
          dense
          size="sm"
          icon="add"
          label="新增任務"
          color="primary"
          @click="addNewTask"
        >
          <q-tooltip>新增任務 (Ctrl+N)</q-tooltip>
        </q-btn>
      </div>

      <div class="toolbar-section">
        <q-btn
          flat
          dense
          size="sm"
          icon="unfold_more"
          label="全部展開"
          color="blue-grey"
          @click="expandAll"
        >
          <q-tooltip>展開所有項目 (Ctrl+E)</q-tooltip>
        </q-btn>

        <q-btn
          flat
          dense
          size="sm"
          icon="unfold_less"
          label="全部縮合"
          color="blue-grey"
          @click="collapseAll"
        >
          <q-tooltip>縮合所有項目 (Ctrl+R)</q-tooltip>
        </q-btn>
      </div>

      <div class="toolbar-section">
        <q-btn
          flat
          dense
          size="sm"
          icon="zoom_in"
          @click="zoomIn"
        >
          <q-tooltip>放大</q-tooltip>
        </q-btn>

        <q-btn
          flat
          dense
          size="sm"
          icon="zoom_out"
          @click="zoomOut"
        >
          <q-tooltip>縮小</q-tooltip>
        </q-btn>

        <q-btn
          flat
          dense
          size="sm"
          icon="fit_screen"
          @click="fitToScreen"
        >
          <q-tooltip>適合螢幕</q-tooltip>
        </q-btn>
      </div>

      <div class="toolbar-section">
        <q-btn
          flat
          dense
          size="sm"
          icon="help_outline"
          color="grey-6"
          @click="showKeyboardShortcuts = true"
        >
          <q-tooltip>鍵盤快捷鍵</q-tooltip>
        </q-btn>
      </div>

    <!-- 鍵盤快捷鍵對話框 -->
    <q-dialog v-model="showKeyboardShortcuts">
      <q-card style="min-width: 350px">
        <q-card-section>
          <div class="text-h6">Keyboard shortcuts:</div>
          <div>
            <p><b>Global</b></p>
            <ul>
              <li><b>Tab</b> - select gantt</li>
              <li><b>Alt + Up/Down/Left/Right</b> - scroll gantt</li>
              <li><b>Ctrl + Enter</b> - create new task</li>
              <li><b>Ctrl + Z</b> - undo</li>
              <li><b>Ctrl + R</b> - redo</li>
            </ul>
            <p><b>Header Cells</b></p>
            <ul>
              <li><b>Left/Right</b> - navigate over cells</li>
              <li><b>Home/End</b> - navigate to the first/last column</li>
              <li><b>Down</b> - navigate to task rows</li>
              <li><b>Space/Enter</b> - click header</li>
            </ul>
            <p><b>Task rows</b></p>
            <ul>
              <li><b>Up/Down</b> - navigate rows</li>
              <li><b>PageDown/PageUp</b> - navigate to the first/last task</li>
              <li><b>Space</b> - select task</li>
              <li><b>Ctrl + Enter</b> - create new task</li>
              <li><b>Delete</b> - delete selected task</li>
              <li><b>Enter</b> - open the lightbox</li>
              <li><b>Ctrl + Left/Right</b> - expand, collapse tree</li>
            </ul>
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="關閉" color="primary" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>
    </div>

    <!-- 甘特圖容器 -->
    <div ref="ganttContainer" class="gantt-container"></div>
  </div>
</template>

<script>
import { onMounted, onBeforeUnmount, ref, watch, computed } from 'vue'
import { useTaskStore } from 'src/stores/taskStore'
import { gantt } from 'dhtmlx-gantt'
import 'dhtmlx-gantt/codebase/dhtmlxgantt.css'

export default {
  name: 'GanttView',

  props: {
    filters: {
      type: Object,
      default: () => ({})
    }
  },

  emits: ['task-edit', 'task-create'],

  setup(props, { emit }) {
    const ganttContainer = ref(null)
    const taskStore = useTaskStore()
    const showKeyboardShortcuts = ref(false)

    let ganttInstance = null
    let filterEventId = null

    // Get gantt data from store
    const ganttData = computed(() => taskStore.ganttData)

    // Initialize Gantt chart
    onMounted(() => {
      // 等待容器完全渲染
      setTimeout(() => {
        initializeGantt()
      }, 100)
    })

    const initializeGantt = () => {
      if (!ganttContainer.value) {
        console.error('Gantt container not ready')
        return
      }

      console.log('Initializing Gantt chart...')

      // Configure Gantt - 使用新的配置方式
      gantt.config.date_format = '%Y-%m-%d %H:%i'

      // 新的時間軸配置方式
      gantt.config.scales = [
        { unit: 'month', step: 1, format: '%Y年%m月' },
        { unit: 'day', step: 1, format: '%m/%d' }
      ]

      gantt.config.scale_height = 50
      gantt.config.min_column_width = 60
      gantt.config.autofit = false
      gantt.config.fit_tasks = false
      gantt.config.scroll_on_load = true

      // 確保顯示所有任務
      gantt.config.start_date = null
      gantt.config.end_date = null

      // 定義自訂編輯器選項
      const statusOptions = [
        { key: 'todo', label: '待辦' },
        { key: 'in_progress', label: '進行中' },
        { key: 'done', label: '已完成' },
        { key: 'blocked', label: '阻塞' }
      ]

      // Configure columns with inline editors
      gantt.config.columns = [
        {
          name: 'text',
          label: '任務名稱',
          width: 200,
          tree: true,
          editor: { type: 'text', map_to: 'text' }
        },
        {
          name: 'start_date',
          label: '開始日期',
          width: 100,
          align: 'center',
          editor: { type: 'date', map_to: 'start_date' }
        },
        {
          name: 'status',
          label: '狀態',
          width: 90,
          align: 'center',
          editor: {
            type: 'select',
            map_to: 'status',
            options: statusOptions
          },
          template: function(task) {
            const option = statusOptions.find(opt => opt.key === task.status)
            return option ? option.label : task.status
          }
        },
        {
          name: 'assignee',
          label: '執行人',
          width: 120,
          align: 'center',
          editor: { type: 'text', map_to: 'assignee' },
          template: function(task) {
            return task.assignee || '未指派'
          }
        }
      ]

      gantt.config.preserve_scroll = true // 確保重繪時不會丟失滾動位置
      gantt.config.scroll_on_load = true // 確保載入時不會丟失滾動位置
      gantt.config.touch = true // 啟用觸控支持
      gantt.config.touch_drag = true // 啟用觸控拖動支持
      gantt.config.sort = true // 啟用排序功能

      // 啟用樹狀結構顯示
      gantt.config.open_tree_initially = true // 預設展開
      gantt.config.branch_loading = false // 禁用分支加載(PRO版功能)
      gantt.config.show_task_cells = true // displaying column borders in the chart area

      // Inline 編輯配置
      gantt.config.inline_editors_multiselect_open = false // 禁用多選時打開編輯器
      gantt.config.inline_editors_date_format = '%Y-%m-%d' // 日期格式

      // Enable drag and drop - 但先暫時禁用 links 相關功能
      gantt.config.drag_links = false // 暫時禁用以避免錯誤
      gantt.config.drag_progress = true // 啟用拖動進度條
      gantt.config.drag_resize = true // 啟用拖動調整任務長度

      // 禁用內建的 lightbox 編輯器，使用我們自己的對話框
      gantt.config.lightbox.sections = []

      // 自定義新任務的預設值
      gantt.attachEvent('onTaskCreated', (task) => {
        task.text = '新任務'
        task.duration = 1
        task.start_date = gantt.getClosestWorkTime({
          date: new Date(),
          dir: 'future'
        })
        return true
      })

      // 啟用zoom擴展
      gantt.ext.zoom.init({
        levels: [
          {
            name: 'day',
            scale_height: 50,
            min_column_width: 80,
            scales: [
              { unit: 'month', step: 1, format: '%Y年%m月' },
              { unit: 'day', step: 1, format: '%m/%d' }
            ]
          },
          {
            name: 'week',
            scale_height: 50,
            min_column_width: 50,
            scales: [
              { unit: 'month', step: 1, format: '%Y年%m月' },
              { unit: 'week', step: 1, format: '第%W週' }
            ]
          },
          {
            name: 'month',
            scale_height: 50,
            min_column_width: 120,
            scales: [
              { unit: 'year', step: 1, format: '%Y年' },
              { unit: 'month', step: 1, format: '%m月' }
            ]
          }
        ]
      })

      // 設置中文語言包
      gantt.locale = {
        date: {
          month_full: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],
          month_short: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
          day_full: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'],
          day_short: ['日', '一', '二', '三', '四', '五', '六']
        }
      }

      gantt.plugins({
        drag_timeline: true, // 啟用拖動時間軸插件
        tooltip: true, // 啟用 tooltip 插件
        undo: true, // 啟用 undo 插件
        marker: true, // 啟用 marker 插件
        keyboard_navigation: true, // 啟用鍵盤導航
        inline_editors: true // 啟用 inline 編輯器插件
      })

      // 自定義 tooltip 模板
      gantt.templates.tooltip_text = (start, end, task) =>
        `<b>任務:</b> ${task.text}<br/>
        <b>描述:</b> ${task.description || '無描述'}<br/>
        <b>執行人:</b> ${task.assignee || '未指定'}<br/>
        <b>狀態:</b> ${task.status || '未指定'}`

      // Initialize gantt
      gantt.init(ganttContainer.value)
      ganttInstance = true // 標記為已初始化

      // Load initial data with debug logging
      const data = ganttData.value

      if (data && data.data && data.data.length > 0) {
        // 暫時只載入任務數據，不載入 links
        const safeData = {
          data: data.data,
          links: [] // 暫時不載入 links 避免錯誤
        }
        gantt.parse(safeData)
      } else {
        // 如果沒有任務，載入一個示例任務
        const sampleData = {
          data: [
            {
              id: 'sample-1',
              text: '示例任務',
              start_date: new Date().toISOString().split('T')[0],
              duration: 3,
              progress: 0.5,
              parent: 0
            }
          ],
          links: []
        }
        gantt.parse(sampleData)
      }

      // Event handlers
      setupEventHandlers()

      // Setup filtering
      setupFiltering()
    }

    // Helper function to convert Gantt date to local datetime string
    const getLocalDateTimeString = (date) => {
      if (!date) return null
      const d = new Date(date)
      // 使用本地時間，不進行UTC轉換
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      const hours = String(d.getHours()).padStart(2, '0')
      const minutes = String(d.getMinutes()).padStart(2, '0')
      const seconds = String(d.getSeconds()).padStart(2, '0')
      return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`
    }

    // Setup event handlers
    const setupEventHandlers = () => {
      // Task updated event (包括 inline 編輯)
      gantt.attachEvent('onAfterTaskUpdate', (id, item) => {
        const task = taskStore.getTaskById(id)
        if (task) {
          const updateData = {
            title: item.text,
            startTime: item.start_date ? getLocalDateTimeString(item.start_date) : null,
            endTime: item.end_date ? getLocalDateTimeString(item.end_date) : null
          }

          // 如果有 duration 變更，計算結束時間
          if (item.duration && item.start_date) {
            const endDate = new Date(item.start_date)
            endDate.setDate(endDate.getDate() + item.duration)
            updateData.endTime = getLocalDateTimeString(endDate)
          }

          // 如果有 progress 變更，更新狀態
          if (item.progress !== undefined) {
            let status = 'todo'
            if (item.progress >= 1) status = 'done'
            else if (item.progress > 0) status = 'in_progress'
            updateData.status = status
          }

          // 直接更新狀態和優先級
          if (item.status) {
            updateData.status = item.status
          }

          if (item.priority) {
            updateData.priority = item.priority
          }

          if (item.assignee !== undefined) {
            updateData.assignee = item.assignee || ''
          }

          console.log('Updating task via inline edit:', id, updateData)
          taskStore.updateTask(id, updateData)
        }
      })

      // Task progress updated
      gantt.attachEvent('onAfterProgressDrag', (id, progress) => {
        const task = taskStore.getTaskById(id)
        if (task) {
          let status = 'todo'
          if (progress >= 1) status = 'done'
          else if (progress > 0) status = 'in_progress'

          taskStore.updateTask(id, { status })
        }
      })

      // Task double click for editing
      gantt.attachEvent('onTaskDblClick', (id) => {
        // Emit event to parent component to open edit dialog
        emit('task-edit', id)
        return false // Prevent default gantt edit
      })

      // Task creation - 發送事件
      gantt.attachEvent('onAfterTaskAdd', (id, item) => {
        // 立即刪除甘特圖中的任務，防止未確認的任務顯示
        gantt.deleteTask(id, false) // false = 不觸發 onAfterTaskDelete 事件

        // 發送創建事件給父組件處理
        const taskData = {
          title: item.text || '新任務',
          startTime: item.start_date ? getLocalDateTimeString(item.start_date) : null,
          endTime: item.end_date ? getLocalDateTimeString(item.end_date) : null,
          parentId: item.parent !== '0' ? item.parent : null
        }
        emit('task-create', taskData)
        return false // 阻止預設行為
      })

      // Task deletion
      gantt.attachEvent('onAfterTaskDelete', (id) => {
        taskStore.deleteTask(id)
      })

      // 增強快速新增體驗
      // 空白區域雙擊新增任務
      gantt.attachEvent('onEmptyClick', (e) => {
        if (e.detail === 2) { // 雙擊
          // 計算點擊位置對應的日期
          const date = gantt.dateFromPos(e.offsetX - gantt.config.grid_width)
          if (date) {
            createQuickTask(date)
          }
        }
        return true
      })

      // 右鍵選單支援
      gantt.attachEvent('onContextMenu', (taskId, linkId, e) => {
        if (!taskId && !linkId) {
          // 空白區域右鍵
          e.preventDefault()
          showContextMenu(e)
          return false
        }
        return true
      })
    }

    // 創建快速任務的統一函數
    const createQuickTask = (startDate) => {
      // 直接打開編輯對話框來新增任務，不預先加入甘特圖
      const tempTaskData = {
        startTime: getLocalDateTimeString(startDate),
        endTime: getLocalDateTimeString(new Date(startDate.getTime() + 24 * 60 * 60 * 1000)), // +1 day
        title: '新任務',
        parentId: null
      }
      // 發送新增事件給父組件處理
      emit('task-create', tempTaskData)
    }

    // 顯示右鍵選單
    const showContextMenu = (e) => {
      // 創建簡單的右鍵選單
      const menu = document.createElement('div')
      menu.className = 'gantt-context-menu'
      menu.style.position = 'fixed'
      menu.style.left = e.clientX + 'px'
      menu.style.top = e.clientY + 'px'
      menu.style.background = 'white'
      menu.style.border = '1px solid #ccc'
      menu.style.borderRadius = '4px'
      menu.style.padding = '4px 0'
      menu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)'
      menu.style.zIndex = '1000'

      const addTaskOption = document.createElement('div')
      addTaskOption.textContent = '新增任務'
      addTaskOption.style.padding = '8px 16px'
      addTaskOption.style.cursor = 'pointer'
      addTaskOption.style.fontSize = '13px'

      addTaskOption.onmouseover = () => {
        addTaskOption.style.background = '#f0f0f0'
      }
      addTaskOption.onmouseout = () => {
        addTaskOption.style.background = 'white'
      }

      addTaskOption.onclick = () => {
        const date = gantt.dateFromPos(e.offsetX - gantt.config.grid_width)
        createQuickTask(date || new Date())
        if (menu.parentNode) {
          document.body.removeChild(menu)
        }
      }

      menu.appendChild(addTaskOption)
      document.body.appendChild(menu)

      // 點擊外部關閉選單
      const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
          if (menu.parentNode) {
            document.body.removeChild(menu)
          }
          document.removeEventListener('click', closeMenu)
        }
      }

      setTimeout(() => {
        document.addEventListener('click', closeMenu)
      }, 100)
    }

    // Setup filtering functionality
    const setupFiltering = () => {
      console.log('Setting up filtering...')

      // 先移除可能存在的舊事件
      if (filterEventId) {
        gantt.detachEvent(filterEventId)
      }

      filterEventId = gantt.attachEvent('onBeforeTaskDisplay', (id) => {
        const taskData = taskStore.getTaskById(id)
        if (!taskData) {
          console.log('No task data found for id:', id)
          return true // 如果找不到任務資料，顯示任務
        }

        const filters = props.filters || {}

        // searchText filter - 搜尋標題和描述
        if (filters.searchText && filters.searchText.trim()) {
          const search = filters.searchText.toLowerCase().trim()
          const matchTitle = taskData.title && taskData.title.toLowerCase().includes(search)
          const matchDescription = taskData.description && taskData.description.toLowerCase().includes(search)
          const matchAssignee = taskData.assignee && taskData.assignee.toLowerCase().includes(search)

          if (!matchTitle && !matchDescription && !matchAssignee) {
            console.log('Task', id, 'filtered out by search:', search)
            return false
          }
        }

        // Status filter
        if (filters.status && taskData.status !== filters.status) {
          return false
        }

        // Priority filter
        if (filters.priority && taskData.priority !== filters.priority) {
          return false
        }

        // Tags filter
        if (filters.tags && filters.tags.length > 0) {
          const taskTags = taskData.tags || []
          const hasMatchingTag = filters.tags.some(tag => taskTags.includes(tag))
          if (!hasMatchingTag) {
            return false
          }
        }

        // Assignee filter
        if (filters.assignee && taskData.assignee !== filters.assignee) {
          return false
        }

        // Date range filter
        if (filters.dateRange && (filters.dateRange.start || filters.dateRange.end)) {
          const taskStart = taskData.startTime ? new Date(taskData.startTime) : null
          const taskEnd = taskData.endTime ? new Date(taskData.endTime) : null

          if (filters.dateRange.start) {
            const filterStart = new Date(filters.dateRange.start)
            if (taskEnd && taskEnd < filterStart) {
              return false
            }
          }

          if (filters.dateRange.end) {
            const filterEnd = new Date(filters.dateRange.end)
            if (taskStart && taskStart > filterEnd) {
              return false
            }
          }
        }

        // Quick filters
        if (filters.quickFilter) {
          const now = new Date()
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

          switch (filters.quickFilter) {
            case 'today': {
              const taskDate = taskData.startTime ? new Date(taskData.startTime) : null
              if (!taskDate || taskDate.toDateString() !== today.toDateString()) {
                return false
              }
              break
            }

            case 'week': {
              const weekStart = new Date(today)
              weekStart.setDate(today.getDate() - today.getDay())
              const weekEnd = new Date(weekStart)
              weekEnd.setDate(weekStart.getDate() + 6)

              const taskStartDate = taskData.startTime ? new Date(taskData.startTime) : null
              if (!taskStartDate || taskStartDate < weekStart || taskStartDate > weekEnd) {
                return false
              }
              break
            }

            case 'overdue': {
              const taskEndDate = taskData.endTime ? new Date(taskData.endTime) : null
              if (!taskEndDate || taskEndDate >= today || taskData.status === 'done') {
                return false
              }
              break
            }
          }
        }
        return true
      })

      return filterEventId
    }

    // Apply filters to gantt chart
    const applyFilters = () => {
      console.log('Applying filters:', props.filters, 'ganttInstance:', ganttInstance)
      if (ganttInstance) {
        console.log('Applying filters:', props.filters)

        // 先嘗試簡單的測試過濾
        if (props.filters && props.filters.status) {
          console.log('Applying status filter:', props.filters.status)
        }

        gantt.render() // 使用 render() 而非 refreshData() 來觸發過濾事件
        console.log('Gantt rendered after filter change')
      }
    }

    // Watch for filter changes
    watch(() => props.filters, () => {
      applyFilters()
    }, { deep: true })

    // Watch for data changes and update gantt
    watch(ganttData, (newData) => {
      if (ganttInstance && newData) {
        gantt.clearAll()
        // 確保資料有效才解析
        if (newData.data && Array.isArray(newData.data)) {
          gantt.parse(newData)
          // 重新應用過濾器
          setTimeout(() => {
            applyFilters()
          }, 50)
        }
      }
    }, { deep: true })

    // Cleanup on unmount
    onBeforeUnmount(() => {
      if (ganttInstance) {
        gantt.clearAll()
        if (filterEventId) {
          gantt.detachEvent(filterEventId)
        }
        ganttInstance = false
      }
    })

    // Public methods
    const refreshGantt = () => {
      if (ganttInstance) {
        gantt.clearAll()
        const data = ganttData.value
        console.log('Refreshing Gantt with data:', data)
        gantt.parse(data)
        gantt.render()
        gantt.setSizes()
      } else {
        // 如果甘特圖尚未初始化，則重新初始化
        initializeGantt()
      }
    }

    const setTimeScale = (unit, format) => {
      // 使用新的 scales 配置方式
      if (unit === 'day') {
        gantt.config.scales = [
          { unit: 'month', step: 1, format: '%Y年%m月' },
          { unit: 'day', step: 1, format: format || '%m/%d' }
        ]
      } else if (unit === 'week') {
        gantt.config.scales = [
          { unit: 'month', step: 1, format: '%Y年%m月' },
          { unit: 'week', step: 1, format: '第%W週' }
        ]
      } else if (unit === 'month') {
        gantt.config.scales = [
          { unit: 'year', step: 1, format: '%Y年' },
          { unit: 'month', step: 1, format: '%m月' }
        ]
      }
      gantt.render()
    }

    const exportToPDF = () => {
      gantt.exportToPDF()
    }

    const exportToPNG = () => {
      gantt.exportToPNG()
    }

    // 工具欄功能方法
    const addNewTask = () => {
      createQuickTask(new Date())
    }

    const zoomIn = () => {
      gantt.ext.zoom.zoomIn()
    }

    const zoomOut = () => {
      gantt.ext.zoom.zoomOut()
    }

    const fitToScreen = () => {
      gantt.ext.zoom.setLevel('day')
    }

    // 展開和縮合功能
    const expandAll = () => {
      gantt.eachTask((task) => {
        if (gantt.hasChild(task.id)) {
          gantt.open(task.id)
        }
      })
      gantt.render()
    }

    const collapseAll = () => {
      gantt.eachTask((task) => {
        if (gantt.hasChild(task.id)) {
          gantt.close(task.id)
        }
      })
      gantt.render()
    }

    return {
      ganttContainer,
      showKeyboardShortcuts,
      initializeGantt,
      refreshGantt,
      setTimeScale,
      exportToPDF,
      exportToPNG,
      addNewTask,
      zoomIn,
      zoomOut,
      fitToScreen,
      expandAll,
      collapseAll,
      applyFilters
    }
  }
}
</script>

<style scoped>
.gantt-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: white;
  border-radius: 6px;
  overflow: hidden;
}

.gantt-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #fafafa;
  border-bottom: 1px solid #e0e0e0;
  gap: 16px;
}

.toolbar-section {
  display: flex;
  align-items: center;
  gap: 4px;
}

.toolbar-section:last-child {
  flex: 1;
  justify-content: flex-end;
}

.gantt-container {
  width: 100%;
  height: calc(100vh - 250px);
  min-height: 400px;
  background: white;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .gantt-container {
    min-height: 300px;
  }

  :deep(.gantt_grid) {
    width: 200px !important;
  }
}
</style>
