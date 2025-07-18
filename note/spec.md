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

## 二、dhtmlxGantt 安裝與整合

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
四、功能規格一覽
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

五、主要元件與關聯
元件	功能說明
taskStore.js	Pinia store，包含 tasks、links、tags 與操作函式
TaskList.vue	遞迴任務列表 + vuedraggable 拖曳排序
TaskEditDialog.vue	任務編輯與新增介面
GanttView.vue	dhtmlxGantt 包裝元件，支援事件與資料讀寫同步
FilterBar.vue	狀態 / Tag / 時間範圍篩選控制列
App.vue	容器整合，切換列表／甘特模式，儲存/匯出など

六、接下來可產出的程式碼模組
✅ taskStore.js：Pinia + LocalStorage 儲存

✅ GanttView.vue：dhtmlxGantt 初始化與事件

✅ TaskList.vue：遞迴 + 拖曳

✅ TaskEditDialog.vue：表單編輯功能

✅ App.vue：畫面整合入口

✅ FilterBar.vue：篩選功能

