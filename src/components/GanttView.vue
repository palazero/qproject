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
        
        <q-btn
          flat
          dense
          size="sm"
          icon="add_box"
          label="新增里程碑"
          color="secondary"
          @click="addMilestone"
        >
          <q-tooltip>新增里程碑</q-tooltip>
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
      gantt.config.autosize = 'y'
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
      
      // 設定固定的網格寬度
      gantt.config.grid_width = 440
      gantt.config.grid_resize = true
      
      // 啟用滑鼠拖拉滾動功能
      gantt.config.preserve_scroll = true
      gantt.config.scroll_on_load = true
      gantt.config.touch = true
      gantt.config.touch_drag = true
      
      // 啟用樹狀結構顯示
      gantt.config.open_tree_initially = false // 預設縮合
      gantt.config.branch_loading = false
      gantt.config.show_task_cells = true
      
      // Enable drag and drop - 但先暫時禁用 links 相關功能
      gantt.config.drag_links = false // 暫時禁用以避免錯誤
      gantt.config.drag_progress = true
      gantt.config.drag_resize = true
      
      // 禁用自動連結創建
      gantt.config.auto_scheduling = false
      gantt.config.auto_scheduling_strict = false
      
      // 啟用快速新增功能
      gantt.config.click_drag = {
        callback: onQuickAdd,
        singleClick: false
      }
      
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
      
      // Force render and resize
      gantt.render()
      gantt.setSizes()
      
      // 添加滾動同步事件和滑鼠拖拉支援
      gantt.attachEvent('onGanttScroll', () => {
        // 確保網格和時間軸同步滾動
        return true
      })
      
      // 啟用滑鼠拖拉滾動
      let isDragging = false
      let dragStartX = 0
      let dragStartY = 0
      let scrollStartX = 0
      let scrollStartY = 0
      
      // 延遲設定拖拉功能，等甘特圖完全初始化
      setTimeout(() => {
        setupDragScrolling()
      }, 500)
      
      const setupDragScrolling = () => {
        const ganttDataArea = ganttContainer.value.querySelector('.gantt_data_area')
        const ganttTimeline = ganttContainer.value.querySelector('.gantt_timeline_data')
        
        if (ganttTimeline) {
          ganttTimeline.addEventListener('mousedown', (e) => {
            // 檢查是否點擊在任務條或控制點上
            if (e.target.classList.contains('gantt_task_line') || 
                e.target.classList.contains('gantt_task_drag') ||
                e.target.classList.contains('gantt_link_point') ||
                e.target.classList.contains('gantt_task_progress') ||
                e.target.closest('.gantt_task_line')) {
              return // 不干擾任務拖拉功能
            }
            
            isDragging = true
            dragStartX = e.clientX
            dragStartY = e.clientY
            scrollStartX = ganttTimeline.scrollLeft
            scrollStartY = ganttTimeline.scrollTop
            
            ganttTimeline.style.cursor = 'grabbing'
            e.preventDefault()
          })
          
          document.addEventListener('mousemove', (e) => {
            if (!isDragging) return
            
            const deltaX = e.clientX - dragStartX
            const deltaY = e.clientY - dragStartY
            
            ganttTimeline.scrollLeft = scrollStartX - deltaX
            ganttTimeline.scrollTop = scrollStartY - deltaY
            
            // 同步網格滾動
            if (ganttDataArea) {
              ganttDataArea.scrollTop = ganttTimeline.scrollTop
            }
            
            e.preventDefault()
          })
          
          document.addEventListener('mouseup', () => {
            if (isDragging) {
              isDragging = false
              ganttTimeline.style.cursor = 'grab'
            }
          })
          
          ganttTimeline.addEventListener('mouseleave', () => {
            if (isDragging) {
              ganttTimeline.style.cursor = 'grab'
            }
          })
        }
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

    // Quick add callback function
    const onQuickAdd = (start, end) => {
      if (!start || !end) return
      
      // 計算任務時長
      const duration = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)))
      
      // 創建新任務
      const newTaskId = 'temp_' + Date.now()
      const newTask = {
        id: newTaskId,
        text: '新任務',
        start_date: start,
        duration: duration,
        progress: 0,
        parent: 0
      }
      
      // 添加到甘特圖
      gantt.addTask(newTask)
      
      // 立即進入編輯模式
      setTimeout(() => {
        gantt.selectTask(newTaskId)
        gantt.showLightbox(newTaskId)
      }, 100)
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

      // 鍵盤快捷鍵支援
      gantt.attachEvent('onKeyDown', (keyCode, e) => {
        // Ctrl/Cmd + N: 新增任務
        if ((e.ctrlKey || e.metaKey) && keyCode === 78) {
          e.preventDefault()
          createQuickTask(new Date())
          return false
        }
        
        // Insert 鍵: 新增任務
        if (keyCode === 45) {
          e.preventDefault()
          createQuickTask(new Date())
          return false
        }
        
        // Ctrl/Cmd + E: 全部展開
        if ((e.ctrlKey || e.metaKey) && keyCode === 69) {
          e.preventDefault()
          expandAll()
          return false
        }
        
        // Ctrl/Cmd + R: 全部縮合
        if ((e.ctrlKey || e.metaKey) && keyCode === 82) {
          e.preventDefault()
          collapseAll()
          return false
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

    const addMilestone = () => {
      const newTaskId = 'milestone_' + Date.now()
      const newTask = {
        id: newTaskId,
        text: '新里程碑',
        start_date: new Date(),
        duration: 0,
        progress: 0,
        parent: 0,
        type: 'milestone'
      }
      
      gantt.addTask(newTask)
      setTimeout(() => {
        gantt.selectTask(newTaskId)
        // 使用我們的編輯對話框
        emit('task-edit', newTaskId)
      }, 100)
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
      addMilestone,
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
  height: 600px;
  min-height: 400px;
  background: white;
  position: relative;
}

/* Override dhtmlx gantt styles for better integration with Quasar */
:deep(.gantt_container) {
  font-family: 'Roboto', sans-serif;
  height: 500px;
  overflow: hidden;
}

:deep(.gantt_data_area) {
  height: 400px;
  overflow: auto;
}

:deep(.gantt_grid_data) {
  height: 400px;
  overflow: auto;
}

:deep(.gantt_timeline_data) {
  height: 400px;
  overflow: auto;
  cursor: grab;
}

:deep(.gantt_timeline_data:active) {
  cursor: grabbing;
}

:deep(.gantt_task_bg) {
  pointer-events: none;
}

:deep(.gantt_timeline_data .gantt_task_line) {
  cursor: move;
}

:deep(.gantt_timeline_data .gantt_task_line:hover) {
  cursor: move;
}

:deep(.gantt_grid_scale) {
  background: #f5f5f5;
  border-bottom: 1px solid #e0e0e0;
}

:deep(.gantt_grid_head_cell) {
  background: #f5f5f5;
  color: #424242;
  font-weight: 500;
}

:deep(.gantt_task_line) {
  border-radius: 4px;
}

:deep(.gantt_task_line.gantt_project) {
  background: #1976d2;
}

:deep(.gantt_task_line.gantt_task) {
  background: #4caf50;
}

:deep(.gantt_task_line.gantt_milestone) {
  background: #ff9800;
}

:deep(.gantt_link_line) {
  stroke: #666;
  stroke-width: 2;
}

:deep(.gantt_link_arrow) {
  fill: #666;
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