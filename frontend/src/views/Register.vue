<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const auth = useAuthStore();
const username = ref('');
const password = ref('');
const inviteCode = ref('');
const error = ref('');

async function handleRegister() {
  try {
    error.value = '';
    await auth.register(username.value, password.value, inviteCode.value);
    router.push('/');
  } catch (e: any) {
    error.value = e.response?.data?.error || e.message || '注册失败';
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4">
    <div class="card p-8 w-full max-w-md">
      <h1 class="text-3xl font-bold gradient-text mb-2">创建账号</h1>
      <p class="text-gray-400 mb-8">加入 Rebol AI Gateway</p>

      <form @submit.prevent="handleRegister" class="space-y-4">
        <div>
          <label class="block text-sm text-gray-400 mb-1">用户名</label>
          <input v-model="username" type="text" class="w-full" required />
        </div>
        <div>
          <label class="block text-sm text-gray-400 mb-1">密码</label>
          <input v-model="password" type="password" class="w-full" required />
        </div>
        <div>
          <label class="block text-sm text-gray-400 mb-1">邀请码</label>
          <input v-model="inviteCode" type="text" class="w-full" required />
        </div>

        <div v-if="error" class="text-red-400 text-sm">{{ error }}</div>

        <button type="submit" class="btn-primary w-full">创建账号</button>
      </form>

      <div class="mt-6 text-center text-sm text-gray-400">
        <router-link to="/login" class="text-indigo-400 hover:text-indigo-300">
          已有账号？登录
        </router-link>
      </div>
    </div>
  </div>
</template>