<script setup lang="ts">
import { ref } from 'vue';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const oldPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const error = ref('');
const success = ref(false);

async function handleChangePassword() {
  error.value = '';
  success.value = false;

  if (newPassword.value !== confirmPassword.value) {
    error.value = '两次密码不一致';
    return;
  }

  if (newPassword.value.length < 6) {
    error.value = '密码长度至少为6个字符';
    return;
  }

  try {
    await auth.changePassword(oldPassword.value, newPassword.value);
    success.value = true;
    oldPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
  } catch (e: any) {
    error.value = e.response?.data?.error || e.message || '修改密码失败';
  }
}
</script>

<template>
  <div class="max-w-md">
    <h2 class="text-2xl font-bold mb-6">设置</h2>

    <div class="card p-6 mb-6">
      <h3 class="text-lg font-semibold mb-4">账号信息</h3>
      <div class="space-y-3">
        <div>
          <label class="text-sm text-gray-400">用户名</label>
          <p class="text-white">{{ auth.user?.username }}</p>
        </div>
        <div>
          <label class="text-sm text-gray-400">角色</label>
          <p class="text-white">{{ auth.user?.role === 'admin' ? '管理员' : '普通用户' }}</p>
        </div>
        <div>
          <label class="text-sm text-gray-400">余额</label>
          <p class="text-white">${{ (auth.user?.quota || 0).toFixed(4) }}</p>
        </div>
      </div>
    </div>

    <div class="card p-6">
      <h3 class="text-lg font-semibold mb-4">修改密码</h3>

      <form @submit.prevent="handleChangePassword" class="space-y-4">
        <div>
          <label class="block text-sm text-gray-400 mb-1">当前密码</label>
          <input v-model="oldPassword" type="password" class="w-full" required />
        </div>
        <div>
          <label class="block text-sm text-gray-400 mb-1">新密码</label>
          <input v-model="newPassword" type="password" class="w-full" required />
        </div>
        <div>
          <label class="block text-sm text-gray-400 mb-1">确认新密码</label>
          <input v-model="confirmPassword" type="password" class="w-full" required />
        </div>

        <div v-if="error" class="text-red-400 text-sm">{{ error }}</div>
        <div v-if="success" class="text-green-400 text-sm">密码修改成功</div>

        <button type="submit" class="btn-primary">修改密码</button>
      </form>
    </div>
  </div>
</template>