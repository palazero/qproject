<template>
  <q-page padding>
    <div class="row items-center q-mb-lg">
      <div class="col">
        <div class="text-h5 q-mb-xs">專案管理</div>
        <div class="text-grey-7">管理您的所有專案與團隊協作</div>
      </div>
      <div class="col-auto">
        <q-btn
          color="primary"
          icon="add"
          label="建立專案"
          @click="showCreateDialog = true"
        />
      </div>
    </div>

    <!-- 專案統計卡片 -->
    <div class="row q-gutter-lg q-mb-lg">
      <div class="col-12 col-md-4">
        <q-card class="stats-card">
          <q-card-section>
            <div class="row items-center">
              <div class="col">
                <div class="text-h4 text-primary">{{ projects.length }}</div>
                <div class="text-grey-7">總專案數</div>
              </div>
              <div class="col-auto">
                <q-icon name="folder" size="40px" color="primary" />
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-md-4">
        <q-card class="stats-card">
          <q-card-section>
            <div class="row items-center">
              <div class="col">
                <div class="text-h4 text-positive">{{ activeProjects }}</div>
                <div class="text-grey-7">進行中專案</div>
              </div>
              <div class="col-auto">
                <q-icon name="play_circle" size="40px" color="positive" />
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-md-4">
        <q-card class="stats-card">
          <q-card-section>
            <div class="row items-center">
              <div class="col">
                <div class="text-h4 text-orange">{{ totalTasks }}</div>
                <div class="text-grey-7">總任務數</div>
              </div>
              <div class="col-auto">
                <q-icon name="assignment" size="40px" color="orange" />
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- 專案列表 -->
    <q-card class="projects-card">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">專案列表</div>
        <q-space />
        <q-input
          v-model="searchQuery"
          placeholder="搜尋專案..."
          dense
          outlined
          class="search-input"
        >
          <template v-slot:prepend>
            <q-icon name="search" />
          </template>
        </q-input>
      </q-card-section>

      <q-card-section v-if="loading" class="text-center">
        <q-spinner color="primary" size="40px" />
        <div class="q-mt-md text-grey-7">載入專案中...</div>
      </q-card-section>

      <q-card-section v-else-if="filteredProjects.length === 0" class="text-center">
        <q-icon name="folder_open" size="80px" color="grey-4" />
        <div class="text-h6 text-grey-7 q-mt-md">
          {{ searchQuery ? '沒有找到符合的專案' : '還沒有任何專案' }}
        </div>
        <div class="text-grey-5 q-mb-md">
          {{ searchQuery ? '請嘗試其他關鍵字' : '點擊上方按鈕建立您的第一個專案' }}
        </div>
        <q-btn
          v-if="!searchQuery"
          color="primary"
          icon="add"
          label="建立專案"
          @click="showCreateDialog = true"
        />
      </q-card-section>

      <q-list v-else separator>
        <q-item
          v-for="project in filteredProjects"
          :key="project.id"
          clickable
          class="project-item"
          @click="selectProject(project)"
        >
          <q-item-section avatar>
            <q-avatar
              :color="getProjectColor(project)"
              text-color="white"
              size="48px"
            >
              {{ getProjectInitials(project.name) }}
            </q-avatar>
          </q-item-section>

          <q-item-section>
            <q-item-label class="text-h6">{{ project.name }}</q-item-label>
            <q-item-label caption class="text-grey-7">
              {{ project.description || '沒有描述' }}
            </q-item-label>
            <div class="row items-center q-gutter-sm q-mt-xs">
              <q-chip
                size="sm"
                :color="getStatusColor(project.status)"
                text-color="white"
              >
                {{ getStatusLabel(project.status) }}
              </q-chip>
              <q-chip size="sm" outline>
                {{ getProjectTaskCount(project.id) }} 個任務
              </q-chip>
              <q-chip size="sm" outline>
                {{ getProjectMemberCount(project.id) }} 位成員
              </q-chip>
            </div>
          </q-item-section>

          <q-item-section side>
            <div class="column items-end">
              <div class="text-caption text-grey-7">
                更新時間: {{ formatDate(project.updatedAt) }}
              </div>
              <div class="q-mt-sm">
                <q-btn
                  flat
                  round
                  icon="more_vert"
                  @click.stop="showProjectMenu(project, $event)"
                />
              </div>
            </div>
          </q-item-section>
        </q-item>
      </q-list>
    </q-card>

    <!-- 專案操作選單 -->
    <q-menu
      v-model="showMenu"
      :target="menuTarget"
      auto-close
    >
      <q-list style="min-width: 150px">
        <q-item clickable @click="editProject(selectedProject)">
          <q-item-section avatar>
            <q-icon name="edit" />
          </q-item-section>
          <q-item-section>編輯專案</q-item-section>
        </q-item>
        <q-item clickable @click="manageMembers(selectedProject)">
          <q-item-section avatar>
            <q-icon name="people" />
          </q-item-section>
          <q-item-section>管理成員</q-item-section>
        </q-item>
        <q-separator />
        <q-item
          clickable
          @click="confirmDeleteProject(selectedProject)"
          :disable="!canDeleteProject(selectedProject)"
        >
          <q-item-section avatar>
            <q-icon name="delete" color="negative" />
          </q-item-section>
          <q-item-section class="text-negative">刪除專案</q-item-section>
        </q-item>
      </q-list>
    </q-menu>

    <!-- 建立/編輯專案對話框 -->
    <ProjectDialog
      v-model="showCreateDialog"
      :project="editingProject"
      @project-created="onProjectCreated"
      @project-updated="onProjectUpdated"
    />

    <!-- 專案成員管理對話框 -->
    <ProjectMemberDialog
      v-model="showMemberDialog"
      :project="memberProject"
      @member-added="onMemberAdded"
      @member-removed="onMemberRemoved"
    />
  </q-page>
</template>

<script>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from 'src/stores/projectStore'
import { useTaskStore } from 'src/stores/taskStore'
import { Dialog, Notify } from 'quasar'
import ProjectDialog from 'src/components/ProjectDialog.vue'
import ProjectMemberDialog from 'src/components/ProjectMemberDialog.vue'

export default {
  name: 'ProjectListPage',
  components: {
    ProjectDialog,
    ProjectMemberDialog
  },
  setup() {
    const router = useRouter()
    const projectStore = useProjectStore()
    const taskStore = useTaskStore()

    const loading = ref(false)
    const searchQuery = ref('')
    const showCreateDialog = ref(false)
    const showMemberDialog = ref(false)
    const editingProject = ref(null)
    const memberProject = ref(null)
    const showMenu = ref(false)
    const menuTarget = ref(null)
    const selectedProject = ref(null)

    const projects = computed(() => projectStore.projects)

    const filteredProjects = computed(() => {
      if (!searchQuery.value) return projects.value
      const query = searchQuery.value.toLowerCase()
      return projects.value.filter(project =>
        project.name.toLowerCase().includes(query) ||
        (project.description && project.description.toLowerCase().includes(query))
      )
    })

    const activeProjects = computed(() => {
      return projects.value.filter(p => p.status === 'active').length
    })

    const totalTasks = computed(() => {
      // Count tasks from all projects the user has access to
      const projectIds = projects.value.map(p => p.id)
      return taskStore.tasks.filter(task => 
        task.projectId && projectIds.includes(task.projectId)
      ).length
    })

    const getProjectColor = (project) => {
      const colors = ['primary', 'secondary', 'accent', 'positive', 'info', 'warning']
      const index = project.id.charCodeAt(0) % colors.length
      return colors[index]
    }

    const getProjectInitials = (name) => {
      return name.split(' ').map(word => word[0]).join('').substring(0, 2).toUpperCase()
    }

    const getStatusColor = (status) => {
      const statusColors = {
        active: 'positive',
        completed: 'primary',
        archived: 'grey',
        planning: 'warning'
      }
      return statusColors[status] || 'grey'
    }

    const getStatusLabel = (status) => {
      const statusLabels = {
        active: '進行中',
        completed: '已完成',
        archived: '已封存',
        planning: '規劃中'
      }
      return statusLabels[status] || '未知'
    }

    const getProjectTaskCount = (projectId) => {
      return taskStore.getTasksByProject(projectId).length
    }

    const getProjectMemberCount = (projectId) => {
      const members = projectStore.projectMembers[projectId]
      return members ? members.length : 0
    }

    const formatDate = (dateString) => {
      if (!dateString) return '無'
      const date = new Date(dateString)
      return date.toLocaleDateString('zh-TW')
    }

    const canDeleteProject = (project) => {
      const role = projectStore.userRole[project.id]
      return role === 'owner'
    }

    const selectProject = async (project) => {
      // Set project store first
      projectStore.setCurrentProject(project)
      
      // Force reload tasks for the selected project
      await taskStore.setCurrentProject(project.id)
      
      router.push('/tasks')
    }

    const showProjectMenu = (project, event) => {
      selectedProject.value = project
      menuTarget.value = event.target
      showMenu.value = true
    }

    const editProject = (project) => {
      editingProject.value = project
      showCreateDialog.value = true
    }

    const manageMembers = (project) => {
      memberProject.value = project
      showMemberDialog.value = true
    }

    const confirmDeleteProject = (project) => {
      Dialog.create({
        title: '確認刪除',
        message: `確定要刪除專案「${project.name}」嗎？此操作無法復原。`,
        cancel: true,
        persistent: true
      }).onOk(() => {
        deleteProject(project)
      })
    }

    const deleteProject = async (project) => {
      try {
        await projectStore.deleteProject(project.id)
        Notify.create({
          type: 'positive',
          message: '專案刪除成功',
          position: 'top'
        })
      } catch (error) {
        console.error('Failed to delete project:', error)
      }
    }

    const onProjectCreated = () => {
      showCreateDialog.value = false
      editingProject.value = null
    }

    const onProjectUpdated = () => {
      showCreateDialog.value = false
      editingProject.value = null
    }

    const onMemberAdded = () => {
      // 重新載入專案成員資料
      if (memberProject.value) {
        projectStore.loadProjectMembers(memberProject.value.id)
      }
    }

    const onMemberRemoved = () => {
      // 重新載入專案成員資料
      if (memberProject.value) {
        projectStore.loadProjectMembers(memberProject.value.id)
      }
    }

    const loadProjects = async () => {
      loading.value = true
      try {
        await projectStore.loadProjects()
      } catch (error) {
        console.error('Failed to load projects:', error)
      } finally {
        loading.value = false
      }
    }

    onMounted(() => {
      loadProjects()
    })

    return {
      loading,
      searchQuery,
      showCreateDialog,
      showMemberDialog,
      editingProject,
      memberProject,
      showMenu,
      menuTarget,
      selectedProject,
      projects,
      filteredProjects,
      activeProjects,
      totalTasks,
      getProjectColor,
      getProjectInitials,
      getStatusColor,
      getStatusLabel,
      getProjectTaskCount,
      getProjectMemberCount,
      formatDate,
      canDeleteProject,
      selectProject,
      showProjectMenu,
      editProject,
      manageMembers,
      confirmDeleteProject,
      onProjectCreated,
      onProjectUpdated,
      onMemberAdded,
      onMemberRemoved
    }
  }
}
</script>

<style scoped>
.stats-card {
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.stats-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

.projects-card {
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.project-item {
  padding: 16px;
  border-radius: 8px;
  transition: background-color 0.2s ease;
}

.project-item:hover {
  background-color: rgba(0, 0, 0, 0.02);
}

.search-input {
  width: 250px;
}

@media (max-width: 768px) {
  .search-input {
    width: 200px;
  }
}
</style>
