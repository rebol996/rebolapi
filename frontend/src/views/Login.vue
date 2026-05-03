<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const auth = useAuthStore();
const username = ref('');
const password = ref('');
const error = ref('');

async function handleLogin() {
  try {
    error.value = '';
    await auth.login(username.value, password.value);
    router.push('/');
  } catch (e: any) {
    if (e.response?.status === 0 || e.message?.includes('Network')) {
      error.value = '网络连接错误，请检查后端服务是否运行';
    } else {
      error.value = e.response?.data?.error || e.message || '登录失败';
    }
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4">
    <div class="card p-8 w-full max-w-md">
      <h1 class="text-3xl font-bold gradient-text mb-2">Rebol AI Gateway</h1>
      <p class="text-gray-400 mb-8">半私有 AI 网关平台</p>

      <form @submit.prevent="handleLogin" class="space-y-4">
        <div>
          <label class="block text-sm text-gray-400 mb-1">用户名</label>
          <input v-model="username" type="text" class="w-full" required />
        </div>
        <div>
          <label class="block text-sm text-gray-400 mb-1">密码</label>
          <input v-model="password" type="password" class="w-full" required />
        </div>

        <div v-if="error" class="text-red-400 text-sm">{{ error }}</div>

        <button type="submit" class="btn-primary w-full">登录</button>
      </form>

      <div class="mt-6 text-center text-sm text-gray-400">
        <router-link to="/register" class="text-indigo-400 hover:text-indigo-300">
          使用邀请码注册
        </router-link>
      </div>
    </div>
  </div>
</template>