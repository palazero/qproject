# 任務管理系統架構重構計劃

## 🎯 目標
重新設計本地緩存機制，實現本地優先 + 後台同步的架構，提升用戶體驗和離線支持。

## 📋 核心需求
1. 登入時載入所有活躍專案和相關任務到本地緩存
2. 操作立即更新本地緩存，即時同步到後端
3. 支援完整離線操作
4. 智能衝突解決（相同欄位按修改時間，不同欄位可合併）
5. 自動清理關閉超過1週的專案資料

## 🔧 實作計劃

### Phase 1: 資料模型統一 ✅
- [x] ~~統一前後端欄位命名為 camelCase~~
- [x] ~~清理所有 snake_case 轉換代碼~~
- [x] ~~新增專案狀態字段 (open, close, cancel)~~
- [x] ~~修改專案創建邏輯，預設狀態為 'open'~~
- [x] ~~更新資料載入邏輯，只載入狀態為 'open' 的專案~~

### Phase 2: 專案狀態管理
- [ ] **在專案編輯對話框新增 close/cancel 按鈕**
- [ ] **實作 close 狀態驗證：檢查所有任務是否完成**
- [ ] **實作專案狀態轉換 UI 和邏輯**

### Phase 3: 同步機制重構
- [ ] **設計新的同步佇列結構**
- [ ] **實作即時同步與重試邏輯**
- [ ] **實作 Socket 自動重連機制**
  - Socket 連線時自動重試
  - 每回最多重試 3 次
  - 3 次失敗後間隔 1 小時再試
- [ ] **更新 UI 顯示同步狀態和待同步項目**

### Phase 4: 衝突解決系統
- [ ] **實作版本控制機制**
- [ ] **設計自動合併邏輯**
  - 相同欄位：按修改時間決定
  - 不同欄位：自動合併
- [ ] **實作衝突檢測和解決流程**

### Phase 5: 資料清理機制
- [ ] **實作自動清理邏輯：清除關閉超過 7 天的專案資料**
- [ ] **新增手動清理功能**

### Phase 6: 效能優化（可選）
- [ ] **評估 IndexedDB vs localStorage**
- [ ] **實作 IndexedDB 儲存方案（如需要）**

## 📊 新的資料結構

### 專案模型
```javascript
{
  id: 'uuid',
  name: 'Project Name',
  description: 'Project Description',
  status: 'open' | 'close' | 'cancel',  // 新增
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  closedAt: '2025-01-01T00:00:00Z' | null  // 新增，用於清理邏輯
}
```

### 本地儲存結構
```javascript
{
  user: { id, name, email },
  projects: [{ ...project, status: 'open' }], // 只存活躍專案
  tasks: [{ ...task, projectId: 'active-project-id' }], // 只存活躍專案的任務
  syncQueue: [
    {
      id: 'uuid',
      action: 'create' | 'update' | 'delete',
      entity: 'project' | 'task',
      data: { ... },
      timestamp: 'ISO string',
      retryCount: 0,
      status: 'pending' | 'syncing' | 'failed' | 'success'
    }
  ],
  conflicts: [
    {
      id: 'uuid',
      entity: 'task',
      entityId: 'task-id',
      localData: { ... },
      serverData: { ... },
      conflictFields: ['title', 'status'],
      resolvedAt: null
    }
  ],
  lastSyncTimestamp: 'ISO string'
}
```

## 🔄 同步策略

### 操作流程
1. 用戶操作 → 立即更新本地緩存
2. 加入同步佇列
3. 立即嘗試同步到後端
4. 成功 → 移除佇列項目
5. 失敗 → 標記重試，背景定期重試

### 重試邏輯
- Socket 連線狀態下自動重試
- 每個操作最多重試 3 次
- 3 次失敗後等待 1 小時再重試
- 顯示同步狀態給用戶

### 衝突解決
- 自動檢測版本衝突
- 字段級別的智能合併
- 相同字段按最後修改時間決定
- 不同字段可以合併

## 📝 進度追蹤

**開始日期**: 2025-01-22  
**預計完成**: TBD  
**當前階段**: Phase 2 - 專案狀態管理  
**完成項目**: 5/20+ (Phase 1 完成)  

---
*此文件將隨著實作進度持續更新*