# 📄 任務管理系統 前端規格書（spec.md）

## 一、技術選型

| 模組             | 技術                                                                 |
|------------------|----------------------------------------------------------------------|
| 框架             | Vue 3 + Quasar 2                                                     |
| 狀態管理         | Pinia                                                                |
| 資料儲存         | LocalStorage（自動序列化與持久化）                                  |
| 拖曳排序         | [`vuedraggable@4`](https://github.com/SortableJS/Vue.Draggable.next) |
| 甘特圖檢視       | **dhtmlxGantt** 套件                                                  |
| 任務依賴         | 本地邏輯處理                                                         |

---

## 二、Project-Task 整合架構

### 專案管理系統整合
本系統已整合完整的專案管理功能，支援多專案協作與權限控制：

#### API 整合
- **後端 API**: 基於 `/api/projects/` 端點系列
- **權限控制**: Owner、Admin、Member 三層權限
- **成員管理**: 支援專案成員新增、移除、角色變更

#### 資料架構整合
```javascript
// Task 資料結構擴展
{
  id: 'uuid',
  projectId: 'project-uuid', // 新增：關聯專案ID
  parentId: 'parent-uuid' | null,
  title: 'Task Title',
  // ... 其他欄位保持不變
}

// Project 資料結構
{
  id: 'project-uuid',
  name: 'Project Name',
  description: 'Project Description',
  settings: {
    enableGanttView: true,
    enableTimeTracking: false,
    defaultTaskPriority: 'medium',
    workDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
  },
  status: 'active', // active | completed | archived | planning
  createdAt: 'ISO string',
  updatedAt: 'ISO string'
}
```

#### 核心功能
1. **專案管理**: 建立、編輯、刪除專案
2. **成員管理**: 專案成員邀請、權限控制
3. **專案切換**: 導航欄專案選擇器，切換當前工作專案
4. **任務過濾**: 按專案自動過濾任務，保持現有篩選功能
5. **離線同步**: 專案與任務資料統一同步策略

## 三、dhtmlxGantt 安裝與整合

1. 安裝套件：

   npm install dhtmlx-gantt
建立甘特圖元件 GanttView.vue：

<template>
  <div ref="ganttContainer" class="gantt-container"></div>
</template>

<script>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import gantt from 'dhtmlx-gantt';
import 'dhtmlx-gantt/codebase/dhtmlxgantt.css';

export default {
  props: { tasks: Object }, // { data:[], links:[] }
  setup(props, { emit }) {
    const ganttContainer = ref(null);
    let instance;

    onMounted(() => {
      gantt.config.date_format = '%Y-%m-%d %H:%i';
      instance = gantt.init(ganttContainer.value);
      gantt.parse(props.tasks);

      gantt.attachEvent('onTaskUpdated', (id, item) => {
        emit('task-updated', id, item);
      });
    });

    onBeforeUnmount(() => {
      instance && gantt.clearAll();
    });

    return { ganttContainer };
  }
};
</script>

<style>
.gantt-container {
  width: 100%;
  height: 100%;
}
html, body, #q-app, .q-page-container {
  height: 100%;
  margin: 0;
}
</style>
使用說明：

統一 tasks = { data: Task[], links: Link[] } 給甘特圖；

採用 onTask* 事件同步修改到 Pinia；

記得設定容器高度，否則圖表會不顯示 

三、任務資料結構（JavaScript）
const task = {
  id: 'uuid-1234',
  parentId: null,
  title: '任務標題',
  description: '... ',
  startTime: '2025-07-17T09:00:00',
  endTime: '2025-07-18T17:00:00',
  assignee: 'pala.chen',
  status: 'todo',             // todo | in_progress | done | blocked
  priority: 'medium',         // low | medium | high
  tags: ['UI','Backend'],
  dependencies: ['uuid-1111'], // 依賴任務 id
  sortOrder: 1
};
甘特圖會收到不同結構：

{
  data: [
    { id: 'uuid-1234', text: '任務標題', start_date: '2025-07-17', duration: 2, parent: null, progress: 0 },
    // 子任務、links
  ],
  links: [
    { id: 1, source: 'uuid-1111', target: 'uuid-1234', type: '0' }
  ]
}
五、功能規格一覽

### 專案管理功能
1. 📁 **專案總覽頁面（ProjectListPage.vue）**
- 專案統計卡片：總專案數、進行中專案、總任務數
- 專案列表：搜尋、狀態標籤、成員數量、任務數量
- 專案操作：建立、編輯、刪除、成員管理
- 專案切換：點擊專案直接進入任務管理

2. 🏗️ **專案建立/編輯（ProjectDialog.vue）**
- 基本資訊：專案名稱、描述
- 進階設定：甘特圖啟用、時間追蹤、預設優先級、工作日設定
- 權限檢查：依據使用者角色顯示可用操作

3. 👥 **專案成員管理（ProjectMemberDialog.vue）**
- 成員邀請：電子郵件邀請、角色分配
- 成員列表：顯示成員資訊、角色標籤
- 角色管理：變更成員角色（Owner/Admin/Member）
- 權限控制：依據當前使用者權限控制操作

4. 🔄 **專案切換機制**
- 導航欄專案選擇器：下拉選單快速切換
- 任務自動過濾：切換專案時自動過濾相關任務
- 甘特圖同步：專案切換時同步更新甘特圖資料

### 任務管理功能（原有功能保持）
1. 📋 任務清單（Tree View + 拖曳）
使用 Vue 遞迴元件，加上 vuedraggable 實作排序；

拖曳後更新 Pinia store 的 sortOrder 並儲存到 LocalStorage。

2. 📝 任務編輯 Dialog
使用 QDialog + QForm，欄位包含主旨、內文、時間、執行人、狀態、優先、Tag、依賴任務；

依賴設定只允許已存在任務。

3. 🟡 狀態動畫+進度條
從 TaskList 或 Gantt 都能反應狀態切換動畫：

todo: 灰圈、

in_progress: 動態進度動畫、

done: 綠色動畫勾勾、

blocked: 紅色鎖頭。

4. 🔗 任務依賴管理
依賴關係轉換成 Gantt links；

同時檢查：若依賴任務尚未完成，不允許標記為 done，UI 顯示阻擋原因。

5. 📆 Gantt 檢視模式
單擊切換成 GanttView.vue；

支援時間縮放（日／週／月）；

點擊事件同步到編輯器；

使用 dhtmlxGantt 本身事件與 API 管理。

6. 📦 LocalStorage 持久化
Store 架構：

{
  tasks: Task[],           // 原始任務列表
  links: Link[],           // 依賴關聯
  tags: string[],
  lastUpdated: timestamp
}
使用 Pinia plugin 實作，修改後自動儲存（500ms debounce）。

六、主要元件與關聯

### Store 架構
| 檔案 | 功能說明 |
|------|----------|
| **projectStore.js** | 專案管理 Pinia store：專案 CRUD、成員管理、權限控制 |
| **taskStore.js** | 任務管理 Pinia store：擴展支援 projectId，專案任務過濾 |
| **authStore.js** | 使用者認證 store：登入狀態、使用者資訊管理 |

### 服務層
| 檔案 | 功能說明 |
|------|----------|
| **projectService.js** | 專案 API 呼叫：對應後端 `/api/projects/` 端點系列 |

### 頁面元件
| 元件 | 功能說明 |
|------|----------|
| **ProjectListPage.vue** | 專案總覽：專案列表、統計、搜尋、建立專案 |
| **TaskManagerPage.vue** | 任務管理：支援專案篩選的任務管理介面 |
| **LoginPage.vue** | 登入頁面：使用者認證介面 |

### 通用元件
| 元件 | 功能說明 |
|------|----------|
| **ProjectDialog.vue** | 專案建立/編輯對話框 |
| **ProjectMemberDialog.vue** | 專案成員管理對話框 |
| **TaskList.vue** | 遞迴任務列表 + vuedraggable 拖曳排序 |
| **TaskEditDialog.vue** | 任務編輯與新增介面 |
| **GanttView.vue** | dhtmlxGantt 包裝元件，支援專案任務篩選 |
| **FilterBar.vue** | 狀態 / Tag / 時間範圍篩選控制列 |

### 布局元件
| 元件 | 功能說明 |
|------|----------|
| **MainLayout.vue** | 主要布局：導航欄、專案選擇器、側邊欄、使用者選單 |

七、已完成實作的程式碼模組

### 專案管理系統
✅ **projectService.js**：專案 API 呼叫服務  
✅ **projectStore.js**：專案 Pinia store 狀態管理  
✅ **ProjectDialog.vue**：專案建立/編輯元件  
✅ **ProjectListPage.vue**：專案總覽頁面  
✅ **ProjectMemberDialog.vue**：專案成員管理元件  

### 任務管理系統整合
✅ **taskStore.js**：擴展支援 projectId，新增專案相關 getters  
✅ **MainLayout.vue**：增加專案選擇器與導航更新  
✅ **routes.js**：新增專案路由配置  

### 原有任務管理功能
✅ **taskStore.js**：Pinia + LocalStorage 儲存  
✅ **GanttView.vue**：dhtmlxGantt 初始化與事件  
✅ **TaskList.vue**：遞迴 + 拖曳  
✅ **TaskEditDialog.vue**：表單編輯功能  
✅ **TaskManagerPage.vue**：任務管理主頁  
✅ **FilterBar.vue**：篩選功能  

### 系統架構特點
- **前後端整合**: 完整的 API 呼叫與離線同步機制  
- **權限控制**: 三層權限（Owner/Admin/Member）管理  
- **無縫整合**: 保持所有原有任務管理功能  
- **響應式設計**: 支援桌面端與行動端  
- **專案隔離**: 任務按專案自動過濾，支援多專案協作

