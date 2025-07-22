# 任務管理系統後端整合技術規格

## 技術架構概覽

### 選定技術棧
- **資料庫**: PostgreSQL (支援 JSON 欄位處理複雜階層結構)
- **API框架**: Node.js + Express
- **實時通信**: Socket.io
- **快取策略**: Redis (處理頻繁查詢操作)
- **認證**: JWT Token

## PostgreSQL 資料庫設計

### 資料表結構

```sql
-- 使用者表
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 專案表
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  owner_id UUID REFERENCES users(id),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 任務狀態與優先級枚舉
CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'done', 'blocked');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high');

-- 任務表 - 核心設計
CREATE TABLE tasks (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  parent_id UUID REFERENCES tasks(id),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  assignee_id UUID REFERENCES users(id),
  status task_status DEFAULT 'todo',
  priority task_priority DEFAULT 'medium',
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  sort_order INTEGER DEFAULT 0,
  
  -- JSON 欄位存儲複雜數據
  tags JSONB DEFAULT '[]',
  dependencies JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  
  -- 版本控制與同步
  version INTEGER DEFAULT 1,
  last_modified_by UUID REFERENCES users(id),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- 約束檢查
  CONSTRAINT tasks_parent_check CHECK (id != parent_id)
);

-- 索引優化
CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_parent_id ON tasks(parent_id);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_updated_at ON tasks(updated_at);
CREATE INDEX idx_tasks_dependencies ON tasks USING GIN(dependencies);
CREATE INDEX idx_tasks_tags ON tasks USING GIN(tags);
```

## Node.js + Express API 框架

### 專案目錄結構

```
backend/
├── src/
│   ├── config/
│   │   ├── database.js      # PostgreSQL 連接配置
│   │   ├── redis.js         # Redis 連接配置
│   │   └── socket.js        # Socket.io 設定
│   ├── models/
│   │   ├── User.js          # 使用者資料模型
│   │   ├── Project.js       # 專案資料模型
│   │   └── Task.js          # 任務資料模型
│   ├── routes/
│   │   ├── auth.js          # 認證相關路由
│   │   ├── tasks.js         # 任務 CRUD 操作
│   │   ├── projects.js      # 專案管理路由
│   │   └── sync.js          # 同步相關路由
│   ├── middleware/
│   │   ├── auth.js          # JWT 驗證中介軟體
│   │   ├── validation.js    # 輸入驗證中介軟體
│   │   └── rateLimiter.js   # API 流量控制
│   ├── services/
│   │   ├── TaskService.js   # 任務業務邏輯服務
│   │   ├── SyncService.js   # 實時同步服務
│   │   └── CacheService.js  # 快取管理服務
│   ├── utils/
│   │   ├── logger.js        # 日誌工具
│   │   └── validators.js    # 資料驗證工具
│   └── app.js               # Express 應用程式主檔
├── migrations/              # 資料庫遷移檔案
├── package.json
├── .env.example            # 環境變數範本
└── docker-compose.yml      # 開發環境配置
```

### 核心依賴套件

```json
{
  "name": "task-manager-backend",
  "version": "1.0.0",
  "dependencies": {
    "express": "^4.18.2",
    "pg": "^8.11.3",
    "redis": "^4.6.8",
    "socket.io": "^4.7.2",
    "jsonwebtoken": "^9.0.2",
    "bcryptjs": "^2.4.3",
    "joi": "^17.9.2",
    "express-rate-limit": "^6.10.0",
    "cors": "^2.8.5",
    "helmet": "^7.0.0",
    "dotenv": "^16.3.1",
    "winston": "^3.10.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.1",
    "jest": "^29.6.4",
    "supertest": "^6.3.3"
  }
}
```

## API 設計規格

### 認證系統 API

```javascript
// POST /api/auth/register
{
  "username": "string",
  "email": "string", 
  "password": "string"
}

// POST /api/auth/login
{
  "email": "string",
  "password": "string"
}

// Response
{
  "token": "jwt_token_string",
  "user": {
    "id": "uuid",
    "username": "string",
    "email": "string"
  }
}
```

### 任務管理 API

```javascript
// GET /api/tasks?project_id=uuid&status=todo&since=timestamp
// 回應: Task[]

// POST /api/tasks
{
  "project_id": "uuid",
  "parent_id": "uuid?",
  "title": "string",
  "description": "string?",
  "assignee_id": "uuid?",
  "status": "todo|in_progress|done|blocked",
  "priority": "low|medium|high",
  "start_time": "timestamp?",
  "end_time": "timestamp?",
  "tags": ["string"],
  "dependencies": ["uuid"]
}

// PUT /api/tasks/:id
{
  "version": "number", // 用於版本衝突檢測
  // ... 其他更新欄位
}

// DELETE /api/tasks/:id

// PUT /api/tasks/batch/reorder
{
  "tasks": [
    {
      "id": "uuid",
      "sort_order": "number",
      "parent_id": "uuid?"
    }
  ]
}

// POST /api/tasks/:id/duplicate
// 回應: 新建立的任務物件
```

### 同步相關 API

```javascript
// GET /api/sync/changes/:project_id?since=timestamp
// 回應: 增量變更事件陣列

// POST /api/sync/resolve-conflict
{
  "task_id": "uuid",
  "resolution": {
    "strategy": "server_wins|client_wins|merge",
    "fields": {} // 合併策略的詳細資訊
  }
}
```

## JWT 認證系統實作

### 認證中介軟體

```javascript
// middleware/auth.js
const jwt = require('jsonwebtoken');

const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = { authenticate };
```

### 認證路由

```javascript
// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');

const router = express.Router();

// 使用者註冊
router.post('/register', [
  body('username').isLength({ min: 3 }).trim(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { username, email, password } = req.body;
  
  try {
    // 檢查使用者是否已存在
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }

    // 建立新使用者
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await User.create({
      username,
      email,
      password_hash: hashedPassword
    });

    // 產生 JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username }, 
      process.env.JWT_SECRET, 
      { expiresIn: '7d' }
    );
    
    res.status(201).json({
      token,
      user: { id: user.id, username: user.username, email: user.email }
    });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

// 使用者登入
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email }
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;
```

## TaskService 業務邏輯層

```javascript
// services/TaskService.js
class TaskService {
  constructor(db, cache, sync) {
    this.db = db;
    this.cache = cache;
    this.sync = sync;
  }

  // 獲取任務列表 (支援快取)
  async getTasks(projectId, filters = {}) {
    // 嘗試從快取取得
    let tasks = await this.cache.getTaskList(projectId, filters);
    
    if (!tasks) {
      // 快取未命中，從資料庫查詢
      tasks = await this.queryTasksFromDB(projectId, filters);
      // 寫入快取
      await this.cache.cacheTaskList(projectId, filters, tasks);
    }

    return tasks;
  }

  // 從資料庫查詢任務
  async queryTasksFromDB(projectId, filters) {
    let query = `
      SELECT t.*, u.username as assignee_name 
      FROM tasks t 
      LEFT JOIN users u ON t.assignee_id = u.id 
      WHERE t.project_id = $1
    `;
    
    const params = [projectId];
    
    // 動態添加過濾條件
    if (filters.status) {
      query += ` AND t.status = $${params.length + 1}`;
      params.push(filters.status);
    }
    
    if (filters.since) {
      query += ` AND t.updated_at > $${params.length + 1}`;
      params.push(filters.since);
    }
    
    query += ` ORDER BY t.sort_order, t.created_at`;
    
    const result = await this.db.query(query, params);
    return result.rows;
  }

  // 建立任務
  async createTask(taskData, userId) {
    const {
      project_id, parent_id, title, description, assignee_id,
      status = 'todo', priority = 'medium', start_time, end_time,
      tags = [], dependencies = [], sort_order = 0
    } = taskData;

    const query = `
      INSERT INTO tasks (
        id, project_id, parent_id, title, description, assignee_id,
        status, priority, start_time, end_time, tags, dependencies,
        sort_order, last_modified_by, version
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 1
      ) RETURNING *
    `;

    const params = [
      project_id, parent_id, title, description, assignee_id,
      status, priority, start_time, end_time, 
      JSON.stringify(tags), JSON.stringify(dependencies),
      sort_order, userId
    ];

    const result = await this.db.query(query, params);
    const newTask = result.rows[0];

    // 快取失效
    await this.cache.invalidateTaskCache(project_id, newTask.id);
    
    // 即時廣播
    await this.sync.broadcastTaskUpdate(project_id, newTask, 'created', userId);

    return newTask;
  }

  // 更新任務
  async updateTask(taskId, updates, userId) {
    // 檢查版本衝突
    const currentTask = await this.getTaskById(taskId);
    if (updates.version && currentTask.version !== updates.version) {
      throw new Error('Version conflict detected');
    }

    const setClause = [];
    const params = [taskId];
    let paramIndex = 2;

    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'version' && key !== 'id') {
        if (key === 'tags' || key === 'dependencies') {
          setClause.push(`${key} = $${paramIndex}::jsonb`);
          params.push(JSON.stringify(value));
        } else {
          setClause.push(`${key} = $${paramIndex}`);
          params.push(value);
        }
        paramIndex++;
      }
    });

    setClause.push(`version = version + 1`);
    setClause.push(`last_modified_by = $${paramIndex}`);
    params.push(userId);
    setClause.push(`updated_at = NOW()`);

    const query = `
      UPDATE tasks SET ${setClause.join(', ')} 
      WHERE id = $1 RETURNING *
    `;

    const result = await this.db.query(query, params);
    const updatedTask = result.rows[0];

    // 更新快取
    await this.cache.cacheTask(updatedTask);
    await this.cache.invalidateTaskCache(updatedTask.project_id, taskId);
    
    // 即時廣播
    await this.sync.broadcastTaskUpdate(updatedTask.project_id, updatedTask, 'updated', userId);

    return updatedTask;
  }

  // 驗證循環依賴
  async validateDependencies(taskId, dependencies) {
    const visited = new Set();
    
    const hasCycle = async (currentId) => {
      if (visited.has(currentId)) return true;
      if (currentId === taskId) return true;
      
      visited.add(currentId);
      
      const task = await this.getTaskById(currentId);
      if (!task || !task.dependencies) return false;
      
      const deps = Array.isArray(task.dependencies) ? task.dependencies : JSON.parse(task.dependencies);
      
      for (const depId of deps) {
        if (await hasCycle(depId)) return true;
      }
      
      return false;
    };

    for (const depId of dependencies) {
      visited.clear();
      if (await hasCycle(depId)) {
        return false; // 發現循環
      }
    }
    
    return true; // 無循環
  }

  // 批量重排序任務
  async batchReorderTasks(taskUpdates, userId) {
    const client = await this.db.getClient();
    
    try {
      await client.query('BEGIN');
      
      for (const update of taskUpdates) {
        await client.query(
          'UPDATE tasks SET sort_order = $1, parent_id = $2, updated_at = NOW() WHERE id = $3',
          [update.sort_order, update.parent_id, update.id]
        );
      }
      
      await client.query('COMMIT');
      
      // 快取失效和廣播
      const projectId = taskUpdates[0]?.project_id;
      if (projectId) {
        await this.cache.invalidateTaskCache(projectId);
        await this.sync.broadcastTaskUpdate(projectId, taskUpdates, 'reordered', userId);
      }
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = TaskService;
```

## Socket.io 實時同步

### Socket.io 伺服器配置

```javascript
// config/socket.js
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');

const initializeSocket = (server) => {
  const io = socketIo(server, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:9000",
      credentials: true
    }
  });

  // Socket 認證中介軟體
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.username = decoded.username;
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User ${socket.username} connected`);

    // 加入專案房間
    socket.on('join:project', (projectId) => {
      socket.join(`project:${projectId}`);
      socket.currentProject = projectId;
      console.log(`${socket.username} joined project ${projectId}`);
    });

    // 離開專案房間
    socket.on('leave:project', (projectId) => {
      socket.leave(`project:${projectId}`);
    });

    // 任務編輯鎖定
    socket.on('task:lock', (taskId) => {
      socket.to(`project:${socket.currentProject}`).emit('task:locked', {
        taskId,
        lockedBy: socket.username
      });
    });

    socket.on('task:unlock', (taskId) => {
      socket.to(`project:${socket.currentProject}`).emit('task:unlocked', { taskId });
    });

    // 使用者活動狀態
    socket.on('user:activity', (activity) => {
      socket.to(`project:${socket.currentProject}`).emit('user:activity', {
        userId: socket.userId,
        username: socket.username,
        activity
      });
    });

    // 斷線處理
    socket.on('disconnect', () => {
      console.log(`User ${socket.username} disconnected`);
    });
  });

  return io;
};

module.exports = { initializeSocket };
```

### 同步服務

```javascript
// services/SyncService.js
class SyncService {
  constructor(io, redis) {
    this.io = io;
    this.redis = redis;
  }

  // 廣播任務變更
  async broadcastTaskUpdate(projectId, task, action, userId) {
    const event = {
      type: action, // 'created', 'updated', 'deleted', 'reordered'
      task,
      timestamp: new Date().toISOString(),
      userId
    };

    // 發送給專案中的其他使用者
    this.io.to(`project:${projectId}`).emit('task:sync', event);

    // 記錄到 Redis 以支援離線同步
    await this.redis.lpush(
      `sync:project:${projectId}`,
      JSON.stringify(event)
    );

    // 保持最近 1000 筆同步記錄
    await this.redis.ltrim(`sync:project:${projectId}`, 0, 999);
  }

  // 獲取增量同步數據
  async getIncrementalSync(projectId, since) {
    const events = await this.redis.lrange(`sync:project:${projectId}`, 0, -1);
    
    return events
      .map(event => JSON.parse(event))
      .filter(event => new Date(event.timestamp) > new Date(since))
      .reverse(); // 按時間順序
  }

  // 處理衝突解決
  async resolveConflict(taskId, clientVersion, serverVersion, resolution) {
    switch (resolution.strategy) {
      case 'server_wins':
        return serverVersion;
      case 'client_wins':
        return { ...serverVersion, ...clientVersion, version: serverVersion.version + 1 };
      case 'merge':
        return this.mergeTaskVersions(clientVersion, serverVersion, resolution.fields);
    }
  }

  // 智能合併任務版本
  mergeTaskVersions(clientVersion, serverVersion, mergeFields) {
    const merged = { ...serverVersion };
    
    // 根據 mergeFields 指定的策略合併
    Object.entries(mergeFields).forEach(([field, strategy]) => {
      if (strategy === 'client') {
        merged[field] = clientVersion[field];
      } else if (strategy === 'concat' && Array.isArray(merged[field])) {
        merged[field] = [...new Set([...merged[field], ...clientVersion[field]])];
      }
    });
    
    merged.version = serverVersion.version + 1;
    merged.updated_at = new Date().toISOString();
    
    return merged;
  }
}

module.exports = SyncService;
```

## Redis 快取服務

```javascript
// services/CacheService.js
const crypto = require('crypto');

class CacheService {
  constructor(redis) {
    this.redis = redis;
    this.TTL = {
      TASK_LIST: 300,     // 5 分鐘
      TASK_DETAIL: 600,   // 10 分鐘
      USER_SESSION: 3600, // 1 小時
      SYNC_EVENTS: 86400  // 24 小時
    };
  }

  // 任務列表快取
  async cacheTaskList(projectId, filters, tasks) {
    const key = `tasks:${projectId}:${this.hashFilters(filters)}`;
    await this.redis.setex(key, this.TTL.TASK_LIST, JSON.stringify(tasks));
  }

  async getTaskList(projectId, filters) {
    const key = `tasks:${projectId}:${this.hashFilters(filters)}`;
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  // 單一任務快取
  async cacheTask(task) {
    const key = `task:${task.id}`;
    await this.redis.setex(key, this.TTL.TASK_DETAIL, JSON.stringify(task));
  }

  async getTask(taskId) {
    const key = `task:${taskId}`;
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  // 快取失效策略
  async invalidateTaskCache(projectId, taskId) {
    // 刪除相關的任務列表快取
    const pattern = `tasks:${projectId}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(keys);
    }

    // 刪除單一任務快取
    if (taskId) {
      await this.redis.del(`task:${taskId}`);
    }
  }

  // 使用者活動狀態快取
  async setUserActivity(userId, projectId, activity) {
    const key = `activity:${userId}:${projectId}`;
    await this.redis.setex(key, 60, JSON.stringify(activity));
  }

  async getUsersActivity(projectId) {
    const pattern = `activity:*:${projectId}`;
    const keys = await this.redis.keys(pattern);
    
    const activities = await Promise.all(
      keys.map(async (key) => {
        const activity = await this.redis.get(key);
        return activity ? JSON.parse(activity) : null;
      })
    );

    return activities.filter(Boolean);
  }

  // 產生過濾器雜湊值
  hashFilters(filters) {
    return crypto
      .createHash('md5')
      .update(JSON.stringify(filters))
      .digest('hex');
  }
}

module.exports = CacheService;
```

## 前端 TaskStore 整合

### 更新後的 TaskStore

在現有的 `src/stores/taskStore.js` 中新增後端整合功能：

```javascript
// 在檔案開頭新增
import { api } from 'src/boot/axios'
import { io } from 'socket.io-client'

// 修改 TaskStore 以支援後端整合
export const useTaskStore = defineStore('task', {
  state: () => ({
    // ... 保留現有狀態
    
    // 新增後端整合狀態
    isOnline: navigator.onLine,
    syncStatus: 'idle', // 'idle', 'syncing', 'error'
    pendingActions: [], // 離線時的待同步操作
    currentProjectId: null,
    currentUser: null,
    socket: null,
  }),

  actions: {
    // 初始化後端連接
    async initializeBackend(projectId, userToken) {
      this.currentProjectId = projectId;
      
      // 設定 axios 預設 headers
      api.defaults.headers.common['Authorization'] = `Bearer ${userToken}`;
      
      // 初始化 Socket.io
      this.socket = io(process.env.VUE_APP_API_URL || 'http://localhost:3000', {
        auth: { token: userToken }
      });

      this.socket.on('connect', () => {
        this.isOnline = true;
        this.socket.emit('join:project', projectId);
        this.syncPendingActions();
      });

      this.socket.on('task:sync', (event) => {
        this.handleRealtimeSync(event);
      });

      this.socket.on('disconnect', () => {
        this.isOnline = false;
      });

      // 載入初始數據
      await this.loadTasksFromServer();
      
      // 監聽網路狀態
      this.initializeNetworkMonitoring();
    },

    // 從伺服器載入任務
    async loadTasksFromServer() {
      try {
        this.syncStatus = 'syncing';
        
        const response = await api.get('/tasks', {
          params: { 
            project_id: this.currentProjectId,
            since: this.lastUpdated 
          }
        });

        this.tasks = response.data;
        this.lastUpdated = new Date().toISOString();
        this.syncStatus = 'idle';
        
        // 更新本地快取
        this.saveToLocalStorage();
        
      } catch (error) {
        console.warn('載入任務失敗，使用本地快取:', error);
        this.loadFromLocalStorage();
        this.syncStatus = 'error';
      }
    },

    // 覆寫現有的 createTask 方法以支援後端
    async createTask(taskData) {
      const tempId = uuidv4();
      const newTask = {
        ...taskData,
        id: tempId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _isTemp: true
      };

      // 樂觀更新 UI
      this.tasks.push(newTask);

      if (this.isOnline) {
        try {
          const response = await api.post('/tasks', {
            ...taskData,
            project_id: this.currentProjectId
          });

          // 替換暫時任務
          const index = this.tasks.findIndex(t => t.id === tempId);
          if (index !== -1) {
            this.tasks[index] = response.data;
          }

        } catch (error) {
          this.pendingActions.push({
            type: 'create',
            data: taskData,
            tempId
          });
        }
      } else {
        this.pendingActions.push({
          type: 'create',
          data: taskData,
          tempId
        });
      }

      this.updateTaskLinks();
      return newTask;
    },

    // 覆寫現有的 updateTask 方法
    async updateTask(taskId, updates) {
      const index = this.tasks.findIndex(t => t.id === taskId);
      if (index === -1) return;

      const originalTask = { ...this.tasks[index] };
      
      // 樂觀更新
      this.tasks[index] = {
        ...originalTask,
        ...updates,
        updatedAt: new Date().toISOString()
      };

      if (this.isOnline) {
        try {
          const response = await api.put(`/tasks/${taskId}`, {
            ...updates,
            version: originalTask.version
          });

          this.tasks[index] = response.data;

        } catch (error) {
          if (error.response?.status === 409) {
            // 版本衝突
            await this.handleVersionConflict(taskId, updates, error.response.data);
          } else {
            // 回滾並加入待同步隊列
            this.tasks[index] = originalTask;
            this.pendingActions.push({
              type: 'update',
              taskId,
              data: updates
            });
          }
        }
      } else {
        this.pendingActions.push({
          type: 'update',
          taskId,
          data: updates
        });
      }

      this.updateTaskLinks();
    },

    // 處理實時同步事件
    handleRealtimeSync(event) {
      const { type, task, userId } = event;

      // 忽略自己的操作
      if (userId === this.currentUser?.id) return;

      switch (type) {
        case 'created':
          if (!this.tasks.find(t => t.id === task.id)) {
            this.tasks.push(task);
          }
          break;
        case 'updated':
          const index = this.tasks.findIndex(t => t.id === task.id);
          if (index !== -1) {
            this.tasks[index] = task;
          }
          break;
        case 'deleted':
          this.tasks = this.tasks.filter(t => t.id !== task.id);
          break;
      }

      this.updateTaskLinks();
    },

    // 同步待處理操作
    async syncPendingActions() {
      if (!this.isOnline || this.pendingActions.length === 0) return;

      const actionsToSync = [...this.pendingActions];
      this.pendingActions = [];

      for (const action of actionsToSync) {
        try {
          await this.executeSyncAction(action);
        } catch (error) {
          this.pendingActions.push(action);
        }
      }

      if (actionsToSync.length > 0) {
        await this.loadTasksFromServer();
      }
    },

    // 執行同步操作
    async executeSyncAction(action) {
      switch (action.type) {
        case 'create':
          const response = await api.post('/tasks', {
            ...action.data,
            project_id: this.currentProjectId
          });
          
          // 移除暫時任務
          this.tasks = this.tasks.filter(t => t.id !== action.tempId);
          break;

        case 'update':
          await api.put(`/tasks/${action.taskId}`, action.data);
          break;

        case 'delete':
          await api.delete(`/tasks/${action.taskId}`);
          break;
      }
    },

    // 網路狀態監控
    initializeNetworkMonitoring() {
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.syncPendingActions();
      });

      window.addEventListener('offline', () => {
        this.isOnline = false;
      });
    },

    // 版本衝突處理
    async handleVersionConflict(taskId, localUpdates, serverData) {
      // 簡化處理：伺服器優先
      const index = this.tasks.findIndex(t => t.id === taskId);
      if (index !== -1) {
        this.tasks[index] = serverData.task;
      }
      
      // 可在此實作衝突解決 UI
      console.warn('版本衝突，已採用伺服器版本');
    }
  }
});
```

## 環境配置

### .env 環境變數範本

```bash
# .env.example
NODE_ENV=development
PORT=3000

# 資料庫配置
DATABASE_URL=postgresql://username:password@localhost:5432/taskmanager
DB_HOST=localhost
DB_PORT=5432
DB_NAME=taskmanager
DB_USER=username
DB_PASS=password

# Redis 配置
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT 配置
JWT_SECRET=your-super-secret-key-here
JWT_EXPIRES_IN=7d

# CORS 配置
CLIENT_URL=http://localhost:9000

# 日誌等級
LOG_LEVEL=debug
```

### Docker 開發環境

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: taskmanager
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: devpass
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  backend:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://dev:devpass@postgres:5432/taskmanager
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis
    volumes:
      - ./src:/app/src
    command: npm run dev

volumes:
  postgres_data:
  redis_data:
```

## 部署與監控

### 生產環境配置

1. **容器化部署**: 使用 Docker 進行容器化
2. **負載均衡**: Nginx 反向代理 + SSL 終止
3. **資料庫**: PostgreSQL 主從複寫
4. **快取**: Redis Cluster
5. **監控**: Prometheus + Grafana + Winston 日誌

### 效能優化策略

1. **資料庫索引優化**: 針對常用查詢建立複合索引
2. **連接池管理**: 使用 pg-pool 管理資料庫連接
3. **API 快取**: 多層快取策略 (Redis + 應用層快取)
4. **批量操作**: 減少資料庫往返次數
5. **壓縮**: 啟用 gzip 壓縮減少網路傳輸

### 安全性考量

1. **輸入驗證**: Joi 結構化驗證
2. **SQL 注入防護**: 參數化查詢
3. **XSS 防護**: Helmet 安全標頭
4. **速率限制**: 防止 API 濫用
5. **HTTPS**: 強制加密傳輸

---

## 實作步驟建議

1. **建立後端專案結構**
2. **配置資料庫連接與表結構**
3. **實作基礎 Express 應用與中介軟體**
4. **建立 JWT 認證系統**
5. **開發任務管理 API**
6. **整合 Socket.io 實時通信**
7. **配置 Redis 快取**
8. **修改前端 TaskStore**
9. **建立 Docker 開發環境**
10. **測試與文件編寫**

這份技術規格提供了完整的後端整合方案，可支援現有前端系統的無縫升級，並提供實時協作和離線同步能力。