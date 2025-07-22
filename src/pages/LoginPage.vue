<template>
  <div class="login-container flex flex-center">
    <q-card class="q-pa-lg" style="min-width: 400px">
      <q-card-section class="text-center">
        <div class="text-h4 text-primary q-mb-md">
          {{ isRegisterMode ? '註冊' : '登入' }}
        </div>
        <div class="text-subtitle2 text-grey-6">
          QProject 任務管理系統
        </div>
      </q-card-section>

      <q-card-section>
        <q-form @submit="onSubmit" @reset="onReset" class="q-gutter-md">
          <q-input
            v-if="isRegisterMode"
            v-model="form.username"
            label="使用者名稱"
            :rules="[val => !!val || '請輸入使用者名稱']"
            outlined
            dense
          />

          <q-input
            v-model="form.email"
            label="電子郵件"
            type="email"
            :rules="[val => !!val || '請輸入電子郵件']"
            outlined
            dense
          />

          <q-input
            v-model="form.password"
            label="密碼"
            :type="showPassword ? 'text' : 'password'"
            :rules="[val => !!val || '請輸入密碼']"
            outlined
            dense
          >
            <template v-slot:append>
              <q-icon
                :name="showPassword ? 'visibility_off' : 'visibility'"
                class="cursor-pointer"
                @click="showPassword = !showPassword"
              />
            </template>
          </q-input>

          <q-input
            v-if="isRegisterMode"
            v-model="form.confirmPassword"
            label="確認密碼"
            :type="showPassword ? 'text' : 'password'"
            :rules="[
              val => !!val || '請確認密碼',
              val => val === form.password || '密碼不一致'
            ]"
            outlined
            dense
          />

          <div class="q-mt-md">
            <q-btn
              :label="isRegisterMode ? '註冊' : '登入'"
              type="submit"
              color="primary"
              class="full-width"
              :loading="isLoading"
              :disable="isLoading"
            />
          </div>

          <div class="text-center q-mt-md">
            <q-btn
              :label="isRegisterMode ? '已有帳號？登入' : '沒有帳號？註冊'"
              flat
              color="primary"
              @click="toggleMode"
              :disable="isLoading"
            />
          </div>

          <!-- Demo login button -->
          <div class="text-center q-mt-md" v-if="!isRegisterMode">
            <q-separator class="q-my-md" />
            <q-btn
              label="Demo 登入"
              outline
              color="secondary"
              class="full-width"
              @click="demoLogin"
              :loading="isLoading"
              :disable="isLoading"
            />
            <div class="text-caption text-grey-6 q-mt-xs">
              使用示範帳號快速體驗
            </div>
          </div>
        </q-form>
      </q-card-section>

      <q-card-section v-if="error" class="text-center">
        <q-banner dense rounded class="bg-negative text-white">
          {{ error }}
        </q-banner>
      </q-card-section>
    </q-card>
  </div>
</template>

<script>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { useAuthStore } from 'src/stores/authStore'

export default {
  name: 'LoginPage',
  setup() {
    const $q = useQuasar()
    const router = useRouter()
    const authStore = useAuthStore()

    const isRegisterMode = ref(false)
    const showPassword = ref(false)
    const form = ref({
      username: '',
      email: '',
      password: '',
      confirmPassword: ''
    })

    const isLoading = computed(() => authStore.isLoading)
    const error = computed(() => authStore.error)

    const toggleMode = () => {
      isRegisterMode.value = !isRegisterMode.value
      authStore.clearError()
      onReset()
    }

    const onReset = () => {
      form.value = {
        username: '',
        email: '',
        password: '',
        confirmPassword: ''
      }
    }

    const onSubmit = async () => {
      let result

      if (isRegisterMode.value) {
        result = await authStore.register({
          username: form.value.username,
          email: form.value.email,
          password: form.value.password
        })
      } else {
        result = await authStore.login({
          email: form.value.email,
          password: form.value.password
        })
      }

      if (result.success) {
        $q.notify({
          type: 'positive',
          message: isRegisterMode.value ? '註冊成功！' : '登入成功！',
          position: 'top'
        })
        router.push('/')
      } else {
        $q.notify({
          type: 'negative',
          message: result.error || '操作失敗',
          position: 'top'
        })
      }
    }

    const demoLogin = async () => {
      form.value.email = 'demo@qproject.com'
      form.value.password = 'demo123'
      
      const result = await authStore.login({
        email: form.value.email,
        password: form.value.password
      })

      if (result.success) {
        $q.notify({
          type: 'positive',
          message: '示範登入成功！',
          position: 'top'
        })
        router.push('/')
      } else {
        // If demo login fails, use offline mode
        $q.notify({
          type: 'info',
          message: '無法連接伺服器，使用離線模式',
          position: 'top'
        })
        router.push('/')
      }
    }

    return {
      isRegisterMode,
      showPassword,
      form,
      isLoading,
      error,
      toggleMode,
      onReset,
      onSubmit,
      demoLogin
    }
  }
}
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.q-card {
  border-radius: 16px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
}
</style>