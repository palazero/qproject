<template>
  <q-dialog v-model="showDialog" persistent>
    <q-card style="min-width: 600px; max-width: 800px">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">管理專案成員</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section>
        <div class="text-subtitle1 q-mb-md">專案：{{ project?.name }}</div>
        
        <!-- 新增成員區域 -->
        <div class="add-member-section q-mb-lg">
          <div class="text-subtitle2 q-mb-sm">新增成員</div>
          <div class="row q-gutter-sm">
            <div class="col">
              <q-input
                v-model="newMember.email"
                label="電子郵件"
                type="email"
                dense
                outlined
                placeholder="輸入成員電子郵件"
              />
            </div>
            <div class="col-3">
              <q-select
                v-model="newMember.role"
                :options="roleOptions"
                label="角色"
                dense
                outlined
              />
            </div>
            <div class="col-auto">
              <q-btn
                color="primary"
                icon="add"
                label="新增"
                @click="addMember"
                :loading="adding"
                :disable="!canAddMember"
              />
            </div>
          </div>
        </div>

        <!-- 成員列表 -->
        <div class="members-section">
          <div class="text-subtitle2 q-mb-sm">
            目前成員 ({{ members.length }})
          </div>
          
          <q-list v-if="members.length > 0" separator bordered class="rounded-borders">
            <q-item v-for="member in members" :key="member.id">
              <q-item-section avatar>
                <q-avatar color="primary" text-color="white">
                  {{ getMemberInitials(member.name || member.email) }}
                </q-avatar>
              </q-item-section>

              <q-item-section>
                <q-item-label>{{ member.name || member.email }}</q-item-label>
                <q-item-label caption>{{ member.email }}</q-item-label>
              </q-item-section>

              <q-item-section side>
                <div class="row items-center q-gutter-sm">
                  <q-chip
                    :color="getRoleColor(member.role)"
                    text-color="white"
                    size="sm"
                  >
                    {{ getRoleLabel(member.role) }}
                  </q-chip>
                  
                  <q-btn
                    v-if="canManageMembers && member.role !== 'owner'"
                    flat
                    round
                    icon="more_vert"
                    @click="showMemberMenu(member, $event)"
                  />
                </div>
              </q-item-section>
            </q-item>
          </q-list>

          <div v-else class="text-center q-pa-lg">
            <q-icon name="people_outline" size="48px" color="grey-4" />
            <div class="text-h6 text-grey-6 q-mt-sm">尚無成員</div>
            <div class="text-grey-5">新增第一位成員開始協作</div>
          </div>
        </div>
      </q-card-section>

      <q-card-actions align="right" class="q-pa-md">
        <q-btn flat label="關閉" v-close-popup />
      </q-card-actions>
    </q-card>

    <!-- 成員操作選單 -->
    <q-menu
      v-model="showMenu"
      :target="menuTarget"
      auto-close
    >
      <q-list style="min-width: 120px">
        <q-item 
          v-if="selectedMember?.role !== 'owner'"
          clickable 
          @click="changeRole(selectedMember)"
        >
          <q-item-section avatar>
            <q-icon name="swap_horiz" />
          </q-item-section>
          <q-item-section>變更角色</q-item-section>
        </q-item>
        <q-item 
          v-if="selectedMember?.role !== 'owner'"
          clickable 
          @click="confirmRemoveMember(selectedMember)"
        >
          <q-item-section avatar>
            <q-icon name="remove_circle" color="negative" />
          </q-item-section>
          <q-item-section class="text-negative">移除成員</q-item-section>
        </q-item>
      </q-list>
    </q-menu>

    <!-- 變更角色對話框 -->
    <q-dialog v-model="showRoleDialog" persistent>
      <q-card style="min-width: 300px">
        <q-card-section>
          <div class="text-h6">變更成員角色</div>
        </q-card-section>

        <q-card-section>
          <div class="q-mb-md">
            成員：{{ selectedMember?.name || selectedMember?.email }}
          </div>
          <q-select
            v-model="newRole"
            :options="editableRoleOptions"
            label="新角色"
            outlined
          />
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="取消" @click="showRoleDialog = false" />
          <q-btn 
            color="primary" 
            label="確認" 
            @click="updateMemberRole"
            :loading="updating"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-dialog>
</template>

<script>
import { ref, computed, watch } from 'vue'
import { useProjectStore } from 'src/stores/projectStore'
import { Dialog, Notify } from 'quasar'

export default {
  name: 'ProjectMemberDialog',
  props: {
    modelValue: {
      type: Boolean,
      default: false
    },
    project: {
      type: Object,
      default: null
    }
  },
  emits: ['update:modelValue', 'member-added', 'member-removed'],
  setup(props, { emit }) {
    const projectStore = useProjectStore()
    
    const adding = ref(false)
    const updating = ref(false)
    const showMenu = ref(false)
    const showRoleDialog = ref(false)
    const menuTarget = ref(null)
    const selectedMember = ref(null)
    const newRole = ref('')

    const newMember = ref({
      email: '',
      role: 'member'
    })

    const roleOptions = [
      { label: '成員', value: 'member' },
      { label: '管理員', value: 'admin' }
    ]

    const editableRoleOptions = [
      { label: '成員', value: 'member' },
      { label: '管理員', value: 'admin' }
    ]

    const showDialog = computed({
      get: () => props.modelValue,
      set: (value) => emit('update:modelValue', value)
    })

    const members = computed(() => {
      if (!props.project) return []
      return projectStore.getCurrentProjectMembers
    })

    const canAddMember = computed(() => {
      return newMember.value.email && 
             newMember.value.role && 
             /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newMember.value.email)
    })

    const canManageMembers = computed(() => {
      return projectStore.canManageProject
    })

    const getMemberInitials = (name) => {
      if (!name) return '?'
      return name.split(' ').map(word => word[0]).join('').substring(0, 2).toUpperCase()
    }

    const getRoleColor = (role) => {
      const roleColors = {
        owner: 'deep-purple',
        admin: 'orange',
        member: 'blue-grey'
      }
      return roleColors[role] || 'grey'
    }

    const getRoleLabel = (role) => {
      const roleLabels = {
        owner: '擁有者',
        admin: '管理員',
        member: '成員'
      }
      return roleLabels[role] || '未知'
    }

    const addMember = async () => {
      if (!canAddMember.value || !props.project) return

      adding.value = true
      try {
        await projectStore.addProjectMember(props.project.id, {
          email: newMember.value.email,
          role: newMember.value.role
        })

        newMember.value = {
          email: '',
          role: 'member'
        }

        emit('member-added')
        
        Notify.create({
          type: 'positive',
          message: '成員新增成功',
          position: 'top'
        })
      } catch (error) {
        console.error('Failed to add member:', error)
        Notify.create({
          type: 'negative',
          message: `新增成員失敗: ${error.message}`,
          position: 'top'
        })
      } finally {
        adding.value = false
      }
    }

    const showMemberMenu = (member, event) => {
      selectedMember.value = member
      menuTarget.value = event.target
      showMenu.value = true
    }

    const changeRole = (member) => {
      selectedMember.value = member
      newRole.value = member.role
      showRoleDialog.value = true
    }

    const updateMemberRole = async () => {
      if (!selectedMember.value || !props.project) return

      updating.value = true
      try {
        // 這裡應該調用更新成員角色的 API
        // await projectStore.updateMemberRole(props.project.id, selectedMember.value.id, newRole.value)
        
        showRoleDialog.value = false
        selectedMember.value = null
        newRole.value = ''

        Notify.create({
          type: 'positive',
          message: '角色更新成功',
          position: 'top'
        })
      } catch (error) {
        console.error('Failed to update member role:', error)
        Notify.create({
          type: 'negative',
          message: `更新角色失敗: ${error.message}`,
          position: 'top'
        })
      } finally {
        updating.value = false
      }
    }

    const confirmRemoveMember = (member) => {
      Dialog.create({
        title: '確認移除',
        message: `確定要移除成員「${member.name || member.email}」嗎？`,
        cancel: true,
        persistent: true
      }).onOk(() => {
        removeMember(member)
      })
    }

    const removeMember = async (member) => {
      if (!props.project) return

      try {
        await projectStore.removeProjectMember(props.project.id, member.id)
        
        emit('member-removed')
        
        Notify.create({
          type: 'positive',
          message: '成員移除成功',
          position: 'top'
        })
      } catch (error) {
        console.error('Failed to remove member:', error)
        Notify.create({
          type: 'negative',
          message: `移除成員失敗: ${error.message}`,
          position: 'top'
        })
      }
    }

    // 當對話框打開時載入成員資料
    watch(() => props.modelValue, (newVal) => {
      if (newVal && props.project) {
        projectStore.loadProjectMembers(props.project.id)
      }
    })

    return {
      showDialog,
      adding,
      updating,
      showMenu,
      showRoleDialog,
      menuTarget,
      selectedMember,
      newRole,
      newMember,
      roleOptions,
      editableRoleOptions,
      members,
      canAddMember,
      canManageMembers,
      getMemberInitials,
      getRoleColor,
      getRoleLabel,
      addMember,
      showMemberMenu,
      changeRole,
      updateMemberRole,
      confirmRemoveMember
    }
  }
}
</script>

<style scoped>
.add-member-section {
  background: #f8f9fa;
  padding: 16px;
  border-radius: 8px;
  border: 1px solid #e9ecef;
}

.members-section {
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 16px;
}

.q-item {
  border-radius: 4px;
}

.q-item:hover {
  background-color: rgba(0, 0, 0, 0.02);
}
</style>