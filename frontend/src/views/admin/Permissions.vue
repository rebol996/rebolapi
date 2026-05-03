<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '../../stores/api';
import type { User, Model, UserModelPermission } from '../../types';

const users = ref<User[]>([]);
const allModels = ref<Model[]>([]);
const permissions = ref<UserModelPermission[]>([]);
const selectedUser = ref('');
const loading = ref(true);

onMounted(async () => {
  try {
    const [usersRes, modelsRes, permRes] = await Promise.all([
      api.get('/admin/users'),
      api.get('/models'),
      api.get('/admin/permissions'),
    ]);
    users.value = usersRes.data;
    allModels.value = modelsRes.data;
    permissions.value = permRes.data;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
});

function getUserPermissions(userId: string): string[] {
  return permissions.value.filter(p => p.userId === userId).map(p => p.modelId);
}

async function togglePermission(userId: string, modelId: string) {
  const existing = permissions.value.find(p => p.userId === userId && p.modelId === modelId);
  if (existing) {
    await api.delete('/admin/permissions', { data: { userId, modelId } });
  } else {
    await api.post('/admin/permissions', { userId, modelId });
  }
  const permRes = await api.get('/admin/permissions');
  permissions.value = permRes.data;
}

async function grantAll(selectedUserId: string) {
  const modelIds = allModels.value.map(m => m.id);
  await api.post('/admin/permissions/batch', { userId: selectedUserId, modelIds });
  const permRes = await api.get('/admin/permissions');
  permissions.value = permRes.data;
}

async function revokeAll(selectedUserId: string) {
  await api.post('/admin/permissions/batch', { userId: selectedUserId, modelIds: [] });
  const permRes = await api.get('/admin/permissions');
  permissions.value = permRes.data;
}

function formatStatus(status: string): string {
  return status === 'active' ? '启用' : '禁用';
}
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold mb-6">模型权限</h2>

    <div v-if="loading" class="text-gray-400">加载中...</div>

    <div v-else class="space-y-6">
      <div class="card p-4">
        <label class="block text-sm text-gray-400 mb-2">选择用户</label>
        <select v-model="selectedUser" class="w-full max-w-xs">
          <option value="">请选择用户...</option>
          <option v-for="u in users" :key="u.id" :value="u.id">{{ u.username }}</option>
        </select>

        <div v-if="selectedUser" class="mt-4 flex gap-2">
          <button @click="grantAll(selectedUser)" class="btn-primary text-sm">授予全部</button>
          <button @click="revokeAll(selectedUser)" class="btn-secondary text-sm">撤销全部</button>
        </div>
      </div>

      <div v-if="selectedUser" class="card">
        <table class="w-full">
          <thead>
            <tr class="border-b border-indigo-900/30">
              <th class="text-left p-3 text-gray-400 font-medium">模型</th>
              <th class="text-left p-3 text-gray-400 font-medium">供应商</th>
              <th class="text-left p-3 text-gray-400 font-medium">状态</th>
              <th class="text-left p-3 text-gray-400 font-medium">权限</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in allModels" :key="m.id" class="border-b border-indigo-900/20">
              <td class="p-3">{{ m.name }}</td>
              <td class="p-3 text-sm text-gray-400">{{ m.provider?.name }}</td>
              <td class="p-3">
                <span
                  class="px-2 py-1 text-xs rounded"
                  :class="m.status === 'active' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'"
                >
                  {{ formatStatus(m.status) }}
                </span>
              </td>
              <td class="p-3">
                <label class="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    :checked="getUserPermissions(selectedUser).includes(m.id)"
                    @change="togglePermission(selectedUser, m.id)"
                    class="sr-only peer"
                  />
                  <div class="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>