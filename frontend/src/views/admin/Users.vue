<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '../../stores/api';
import type { User } from '../../types';

const users = ref<User[]>([]);
const loading = ref(true);
const showCreateModal = ref(false);
const newUser = ref({ username: '', password: '', role: 'member', quota: 0 });

onMounted(async () => {
  await fetchUsers();
});

async function fetchUsers() {
  try {
    const { data } = await api.get('/admin/users');
    users.value = data;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

async function createUser() {
  try {
    await api.post('/admin/users', newUser.value);
    showCreateModal.value = false;
    newUser.value = { username: '', password: '', role: 'member', quota: 0 };
    await fetchUsers();
  } catch (e) {
    console.error(e);
  }
}

async function updateUser(id: string, data: any) {
  await api.put(`/admin/users/${id}`, data);
  await fetchUsers();
}

async function deleteUser(id: string) {
  if (!confirm('确定删除此用户？')) return;
  await api.delete(`/admin/users/${id}`);
  await fetchUsers();
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('zh-CN');
}

function formatRole(role: string): string {
  return role === 'admin' ? '管理员' : '普通用户';
}

function formatStatus(status: string): string {
  return status === 'active' ? '正常' : '已禁用';
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-bold">用户管理</h2>
      <button @click="showCreateModal = true" class="btn-primary">创建用户</button>
    </div>

    <div v-if="loading" class="text-gray-400">加载中...</div>

    <div v-else class="card">
      <table class="w-full">
        <thead>
          <tr class="border-b border-indigo-900/30">
            <th class="text-left p-3 text-gray-400 font-medium">用户名</th>
            <th class="text-left p-3 text-gray-400 font-medium">角色</th>
            <th class="text-left p-3 text-gray-400 font-medium">状态</th>
            <th class="text-left p-3 text-gray-400 font-medium">余额</th>
            <th class="text-left p-3 text-gray-400 font-medium">创建时间</th>
            <th class="text-left p-3 text-gray-400 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.id" class="border-b border-indigo-900/20">
            <td class="p-3">{{ user.username }}</td>
            <td class="p-3">
              <span
                class="px-2 py-1 text-xs rounded"
                :class="user.role === 'admin' ? 'bg-purple-900/30 text-purple-400' : 'bg-blue-900/30 text-blue-400'"
              >
                {{ formatRole(user.role) }}
              </span>
            </td>
            <td class="p-3">
              <button
                @click="updateUser(user.id, { status: user.status === 'active' ? 'disabled' : 'active' })"
                class="px-2 py-1 text-xs rounded"
                :class="user.status === 'active' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'"
              >
                {{ formatStatus(user.status) }}
              </button>
            </td>
            <td class="p-3">${{ user.quota.toFixed(4) }}</td>
            <td class="p-3 text-sm text-gray-400">{{ formatDate(user.createdAt) }}</td>
            <td class="p-3">
              <button @click="deleteUser(user.id)" class="text-red-400 hover:text-red-300">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="showCreateModal" class="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
      <div class="card p-6 w-full max-w-md">
        <h3 class="text-lg font-semibold mb-4">创建用户</h3>
        <form @submit.prevent="createUser" class="space-y-4">
          <div>
            <label class="block text-sm text-gray-400 mb-1">用户名</label>
            <input v-model="newUser.username" type="text" class="w-full" required />
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-1">密码</label>
            <input v-model="newUser.password" type="password" class="w-full" required />
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-1">角色</label>
            <select v-model="newUser.role" class="w-full">
              <option value="member">普通用户</option>
              <option value="admin">管理员</option>
            </select>
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-1">初始额度</label>
            <input v-model.number="newUser.quota" type="number" step="0.0001" class="w-full" />
          </div>
          <div class="flex gap-2">
            <button type="submit" class="btn-primary flex-1">创建</button>
            <button type="button" @click="showCreateModal = false" class="btn-secondary flex-1">取消</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>