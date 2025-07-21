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
        <span class="text-caption text-grey-6">
          提示：雙擊空白區域或右鍵點擊新增任務
        </span>
      </div>
    </div>

    <!-- 甘特圖容器 -->
    <div ref="ganttContainer" class="gantt-container"></div>
  </div>
</template>

<script>
import { onMounted, onBeforeUnmount, ref, watch, computed } from 'vue'
import { useTaskStore } from 'src/stores/taskStore'
import gantt from 'dhtmlx-gantt'
import 'dhtmlx-gantt/codebase/dhtmlxgantt.css'

export default {
  name: 'GanttView',

  emits: ['task-edit'],

  setup(props, { emit }) {
    const ganttContainer = ref(null)
    const taskStore = useTaskStore()

    let ganttInstance = null

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

      // Configure columns
      gantt.config.columns = [
        { name: 'text', label: '任務名稱', width: 200, tree: true },
        { name: 'start_date', label: '開始日期', width: 100, align: 'center' },
        { name: 'duration', label: '工期', width: 60, align: 'center' },
        { name: 'progress', label: '進度', width: 80, align: 'center' }
      ]

      // 啟用滑鼠拖拉滾動功能
      gantt.config.preserve_scroll = true
      gantt.config.scroll_on_load = true
      gantt.config.touch = true
      gantt.config.touch_drag = true

      // 啟用樹狀結構顯示
      gantt.config.open_tree_initially = true // 預設展開
      gantt.config.branch_loading = false
      gantt.config.show_task_cells = true

      // Enable drag and drop - 但先暫時禁用 links 相關功能
      gantt.config.drag_links = false // 暫時禁用以避免錯誤
      gantt.config.drag_progress = true
      gantt.config.drag_resize = true
      gantt.config.keyboard_navigation = true

      // 啟用雙擊新增任務
      gantt.config.dblclick_create = true

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
        drag_timeline: true,
        tooltip: true,
        undo: true,
        marker: true
      })

      // Initialize gantt
      ganttInstance = gantt.init(ganttContainer.value)

      // Load initial data with debug logging
      const data = ganttData.value
      console.log('Loading Gantt data:', data)

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
      // Task updated event
      gantt.attachEvent('onAfterTaskUpdate', (id, item) => {
        const task = taskStore.getTaskById(id)
        if (task) {
          taskStore.updateTask(id, {
            title: item.text,
            startTime: item.start_date ? getLocalDateTimeString(item.start_date) : null,
            endTime: item.end_date ? getLocalDateTimeString(item.end_date) : null
          })
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

      // Link created event
      gantt.attachEvent('onAfterLinkAdd', (id, link) => {
        if (!link || !link.source || !link.target) {
          console.warn('Invalid link data:', link)
          return
        }

        const sourceTask = taskStore.getTaskById(link.source)
        const targetTask = taskStore.getTaskById(link.target)

        if (sourceTask && targetTask) {
          // Add dependency to target task
          const dependencies = [...(targetTask.dependencies || [])]
          if (!dependencies.includes(link.source)) {
            dependencies.push(link.source)
            taskStore.updateTask(link.target, { dependencies })
          }
        }
      })

      // Link deleted event
      gantt.attachEvent('onAfterLinkDelete', (id, link) => {
        if (!link || !link.target) {
          console.warn('Invalid link data for deletion:', link)
          return
        }

        const targetTask = taskStore.getTaskById(link.target)
        if (targetTask && targetTask.dependencies) {
          const dependencies = targetTask.dependencies.filter(dep => dep !== link.source)
          taskStore.updateTask(link.target, { dependencies })
        }
      })

      // Task double click for editing
      gantt.attachEvent('onTaskDblClick', (id) => {
        // Emit event to parent component to open edit dialog
        emit('task-edit', id)
        return false // Prevent default gantt edit
      })

      // Task creation
      gantt.attachEvent('onAfterTaskAdd', (id, item) => {
        // Create new task in store
        taskStore.createTask({
          title: item.text || 'New Task',
          startTime: item.start_date ? getLocalDateTimeString(item.start_date) : null,
          endTime: item.end_date ? getLocalDateTimeString(item.end_date) : null,
          parentId: item.parent !== '0' ? item.parent : null
        })
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
      const newTaskId = 'quick_' + Date.now()
      const newTask = {
        id: newTaskId,
        text: '新任務 - 請編輯',
        start_date: startDate,
        duration: 1,
        progress: 0,
        parent: 0
      }

      // 添加到甘特圖並立即編輯
      gantt.addTask(newTask)
      setTimeout(() => {
        gantt.selectTask(newTaskId)
        // 使用我們的編輯對話框而不是內建lightbox
        emit('task-edit', newTaskId)
      }, 100)
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
        document.body.removeChild(menu)
      }

      menu.appendChild(addTaskOption)
      document.body.appendChild(menu)

      // 點擊外部關閉選單
      const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
          document.body.removeChild(menu)
          document.removeEventListener('click', closeMenu)
        }
      }

      setTimeout(() => {
        document.addEventListener('click', closeMenu)
      }, 100)
    }

    // Watch for data changes and update gantt
    watch(ganttData, (newData) => {
      if (ganttInstance) {
        gantt.clearAll()
        gantt.parse(newData)
      }
    }, { deep: true })

    // Cleanup on unmount
    onBeforeUnmount(() => {
      if (ganttInstance) {
        gantt.clearAll()
        ganttInstance = null
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
      collapseAll
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
