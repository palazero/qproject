<template>
  <q-layout view="lHh Lpr lFf">
    <q-header elevated>
      <q-toolbar>
        <q-btn
          flat
          dense
          round
          icon="menu"
          aria-label="Menu"
          @click="toggleLeftDrawer"
        />

        <q-toolbar-title>
          任務管理系統
        </q-toolbar-title>

        <!-- Project selector -->
        <q-select
          v-if="authStore.isAuthenticated && openProjects.length > 0"
          v-model="selectedProject"
          :options="openProjects"
          option-value="id"
          option-label="name"
          label="當前專案"
          dense
          outlined
          emit-value
          map-options
          style="min-width: 180px"
          @update:model-value="onProjectChange"
        >
          <template v-slot:prepend>
            <q-icon name="folder" />
          </template>
          <template v-slot:no-option>
            <q-item>
              <q-item-section class="text-grey">
                沒有可用專案
              </q-item-section>
            </q-item>
          </template>
        </q-select>

        <!-- User info and auth buttons -->
        <div class="row items-center q-gutter-sm">
          <!-- Sync status indicator -->
          <q-chip
            v-if="taskStore.authToken"
            :icon="syncStatusIcon"
            :color="syncStatusColor"
            size="sm"
            :title="syncStatusText"
            clickable
            @click="showSyncDetails"
          >
            {{ syncStatusText }}
            <q-badge
              v-if="taskStore.pendingSyncCount > 0"
              color="orange"
              :label="taskStore.pendingSyncCount"
              floating
            />
          </q-chip>

          <!-- User menu -->
          <q-btn
            v-if="authStore.isAuthenticated"
            flat
            icon="account_circle"
            :label="authStore.userDisplayName"
          >
            <q-menu>
              <q-list style="min-width: 200px">
                <q-item>
                  <q-item-section avatar>
                    <q-icon name="person" />
                  </q-item-section>
                  <q-item-section>
                    <q-item-label>{{ authStore.userDisplayName }}</q-item-label>
                    <q-item-label caption>{{ authStore.user?.email }}</q-item-label>
                  </q-item-section>
                </q-item>

                <q-separator />

                <q-item clickable @click="logout">
                  <q-item-section avatar>
                    <q-icon name="logout" />
                  </q-item-section>
                  <q-item-section>登出</q-item-section>
                </q-item>
              </q-list>
            </q-menu>
          </q-btn>

          <!-- Login button for non-authenticated users -->
          <q-btn
            v-else
            flat
            icon="login"
            label="登入"
            @click="goToLogin"
          />
        </div>

        <q-btn
          flat
          icon="settings"
          label="設定"
        >
          <q-menu>
            <q-list style="min-width: 200px">
              <q-item clickable @click="clearAllData">
                <q-item-section avatar>
                  <q-icon name="delete_sweep" />
                </q-item-section>
                <q-item-section>清除所有資料</q-item-section>
              </q-item>

              <q-separator />

              <!-- Development Tools -->
              <q-item-label header>開發工具</q-item-label>
              
              <q-item clickable @click="generateTestConflict">
                <q-item-section avatar>
                  <q-icon name="merge_type" />
                </q-item-section>
                <q-item-section>生成測試衝突</q-item-section>
              </q-item>

              <q-item clickable @click="simulateConflictScenarios">
                <q-item-section avatar>
                  <q-icon name="bug_report" />
                </q-item-section>
                <q-item-section>模擬衝突場景</q-item-section>
              </q-item>

              <q-item clickable @click="showConflictManager = true">
                <q-item-section avatar>
                  <q-icon name="manage_accounts" />
                </q-item-section>
                <q-item-section>衝突管理器</q-item-section>
              </q-item>

              <q-item clickable @click="showDataCleanupManager = true">
                <q-item-section avatar>
                  <q-icon name="cleaning_services" />
                </q-item-section>
                <q-item-section>資料清理</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </q-btn>
      </q-toolbar>
    </q-header>

    <q-drawer
      v-model="leftDrawerOpen"
      show-if-above
      bordered
    >
      <q-list>
        <q-item-label header>
          主要功能
        </q-item-label>

        <q-item
          clickable
          :to="{ name: 'projects' }"
          active-class="text-primary"
        >
          <q-item-section avatar>
            <q-icon name="folder" />
          </q-item-section>
          <q-item-section>
            <q-item-label>專案管理</q-item-label>
            <q-item-label caption>管理所有專案</q-item-label>
          </q-item-section>
        </q-item>

        <q-item
          clickable
          :to="{ name: 'task-manager' }"
          active-class="text-primary"
        >
          <q-item-section avatar>
            <q-icon name="assignment" />
          </q-item-section>
          <q-item-section>
            <q-item-label>任務管理</q-item-label>
            <q-item-label caption>管理當前專案任務</q-item-label>
          </q-item-section>
        </q-item>

        <q-separator class="q-my-md" />

        <q-item-label header>
          快速動作
        </q-item-label>

        <q-item
          clickable
          @click="createNewTask"
        >
          <q-item-section avatar>
            <q-icon name="add" />
          </q-item-section>
          <q-item-section>
            <q-item-label>新增任務</q-item-label>
          </q-item-section>
        </q-item>

        <q-item
          clickable
          @click="switchToGanttView"
        >
          <q-item-section avatar>
            <q-icon name="timeline" />
          </q-item-section>
          <q-item-section>
            <q-item-label>甘特圖檢視</q-item-label>
          </q-item-section>
        </q-item>

        <q-separator class="q-my-md" />

        <q-item-label header>
          統計資訊
        </q-item-label>

        <q-item>
          <q-item-section avatar>
            <q-icon name="assignment_turned_in" color="positive" />
          </q-item-section>
          <q-item-section>
            <q-item-label>已完成</q-item-label>
            <q-item-label caption>{{ completedTasksCount }} 個任務</q-item-label>
          </q-item-section>
        </q-item>

        <q-item>
          <q-item-section avatar>
            <q-icon name="pending" color="warning" />
          </q-item-section>
          <q-item-section>
            <q-item-label>進行中</q-item-label>
            <q-item-label caption>{{ inProgressTasksCount }} 個任務</q-item-label>
          </q-item-section>
        </q-item>

        <q-item>
          <q-item-section avatar>
            <q-icon name="schedule" color="grey-6" />
          </q-item-section>
          <q-item-section>
            <q-item-label>待辦</q-item-label>
            <q-item-label caption>{{ todoTasksCount }} 個任務</q-item-label>
          </q-item-section>
        </q-item>
      </q-list>
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>

    <!-- Project creation dialog -->
    <ProjectDialog
      v-model="showCreateProjectDialog"
      @project-created="onProjectCreated"
    />

    <!-- Sync queue viewer dialog -->
    <SyncQueueViewer v-model="showSyncQueueDialog" />

    <!-- Conflict manager dialog -->
    <ConflictManager v-model="showConflictManager" />

    <!-- Data cleanup manager dialog -->
    <DataCleanupManager v-model="showDataCleanupManager" />
  </q-layout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTaskStore } from 'src/stores/taskStore'
import { useAuthStore } from 'src/stores/authStore'
import { useProjectStore } from 'src/stores/projectStore'
import { useQuasar } from 'quasar'
import ProjectDialog from 'src/components/ProjectDialog.vue'
import SyncQueueViewer from 'src/components/SyncQueueViewer.vue'
import ConflictManager from 'src/components/ConflictManager.vue'
import DataCleanupManager from 'src/components/DataCleanupManager.vue'

const router = useRouter()
const taskStore = useTaskStore()
const authStore = useAuthStore()
const projectStore = useProjectStore()
const $q = useQuasar()

const leftDrawerOpen = ref(false)
const selectedProject = ref(null)
const showCreateProjectDialog = ref(false)
const showSyncQueueDialog = ref(false)
const showConflictManager = ref(false)
const showDataCleanupManager = ref(false)

// Computed properties for task statistics
const completedTasksCount = computed(() => {
  return taskStore.tasks.filter(task => task.status === 'done').length
})

const inProgressTasksCount = computed(() => {
  return taskStore.tasks.filter(task => task.status === 'in_progress').length
})

const todoTasksCount = computed(() => {
  return taskStore.tasks.filter(task => task.status === 'todo').length
})

// Project related computed properties
const openProjects = computed(() => {
  return projectStore.openProjects || []
})

// Sync status computed properties using enhanced sync queue
const syncStatusIcon = computed(() => {
  return taskStore.syncStatusIcon
})

const syncStatusColor = computed(() => {
  // Override color for conflicts
  if (taskStore.hasUnresolvedConflicts) {
    return 'orange'
  }
  return taskStore.syncStatusColor
})

const syncStatusText = computed(() => {
  return taskStore.syncStatusText
})

// Methods
function toggleLeftDrawer() {
  leftDrawerOpen.value = !leftDrawerOpen.value
}

// Project methods
async function onProjectChange(projectId) {
  if (projectId) {
    const project = openProjects.value.find(p => p.id === projectId)
    if (project) {
      projectStore.setCurrentProject(project)
      await taskStore.setCurrentProject(project.id)
    }
  }
}

function onProjectCreated(project) {
  selectedProject.value = project.id
  onProjectChange(project.id)
  showCreateProjectDialog.value = false
}

function createNewTask() {
  // Navigate to task manager and trigger new task creation
  router.push({ name: 'task-manager' })
  // Trigger create task dialog via store
  taskStore.triggerCreateTask()
}

function switchToGanttView() {
  taskStore.setCurrentView('gantt')
  router.push({ name: 'task-manager' })
}

function clearAllData() {
  $q.dialog({
    title: '確認清除',
    message: '這將刪除所有任務資料，此動作無法復原。確定要繼續嗎？',
    cancel: true,
    persistent: true,
    color: 'negative'
  }).onOk(() => {
    localStorage.removeItem('task-manager-data')
    taskStore.$reset()
    $q.notify({
      message: '所有資料已清除',
      color: 'info',
      icon: 'delete_sweep'
    })
  })
}

function showSyncDetails() {
  // Show conflict manager if there are unresolved conflicts
  if (taskStore.hasUnresolvedConflicts) {
    showConflictManager.value = true
  } else {
    showSyncQueueDialog.value = true
  }
}

// Auth related methods
function goToLogin() {
  router.push('/login')
}

async function logout() {
  $q.dialog({
    title: '確認登出',
    message: '確定要登出嗎？',
    cancel: true,
    persistent: true
  }).onOk(async () => {
    await authStore.logout()
    $q.notify({
      message: '已成功登出',
      color: 'info',
      icon: 'logout'
    })
    router.push('/login')
  })
}

// Development tools
function generateTestConflict() {
  const conflict = taskStore.generateTestConflict()
  if (conflict) {
    $q.notify({
      message: '已生成測試衝突',
      color: 'info',
      icon: 'merge_type'
    })
  } else {
    $q.notify({
      message: '無法生成衝突：沒有可用任務',
      color: 'warning',
      icon: 'warning'
    })
  }
}

function simulateConflictScenarios() {
  try {
    taskStore.simulateConflictScenarios()
    $q.notify({
      message: '已模擬多個衝突場景',
      color: 'info',
      icon: 'bug_report'
    })
  } catch (error) {
    $q.notify({
      message: '模擬衝突失敗',
      color: 'negative',
      icon: 'error'
    })
  }
}

// Initialize data on mount
onMounted(async () => {
  if (authStore.isAuthenticated) {
    await projectStore.loadProjects()

    // Set initial project if available (only open projects)
    if (projectStore.currentProject && projectStore.currentProject.status === 'open') {
      selectedProject.value = projectStore.currentProject.id
    } else if (taskStore.currentProjectId) {
      // Try to find project by stored currentProjectId (only open projects)
      const storedProject = openProjects.value.find(p => p.id === taskStore.currentProjectId)
      if (storedProject) {
        selectedProject.value = storedProject.id
        // Load tasks for this project immediately
        await taskStore.loadTasksFromServer()
      }
    } else if (openProjects.value.length > 0) {
      const firstProject = openProjects.value[0]
      selectedProject.value = firstProject.id
      await onProjectChange(firstProject.id)
    }
  }
})
</script>
