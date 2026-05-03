<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '../stores/api';
import type { ApiKey } from '../types';

const apiKeys = ref<ApiKey[]>([]);
const loading = ref(true);
const showCreateModal = ref(false);
const newKeyName = ref('');
const createdKey = ref('');

onMounted(async () => {
  await fetchKeys();
});

async function fetchKeys() {
  try {
    const { data } = await api.get('/api-keys');
    apiKeys.value = data;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

async function createKey() {
  try {
    const { data } = await api.post('/api-keys', { name: newKeyName.value });
    createdKey.value = data.key;
    showCreateModal.value = true;
    await fetchKeys();
  } catch (e) {
    console.error(e);
  }
}

async function deleteKey(id: string) {
  if (!confirm('确定删除此 API Key？')) return;
  await api.delete(`/api-keys/${id}`);
  await fetchKeys();
}

async function toggleKey(id: string) {
  await api.put(`/api-keys/${id}/toggle`);
  await fetchKeys();
}

function formatDate(date: string): string {
  return new Date(date).toLocaleString('zh-CN');
}

function formatStatus(status: string): string {
  return status === 'active' ? '正常' : '已禁用';
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-bold">我的 API Key</h2>
      <button @click="showCreateModal = true; newKeyName = ''; createdKey = ''" class="btn-primary">
        创建新 Key
      </button>
    </div>

    <div v-if="loading" class="text-gray-400">加载中...</div>

    <div v-else class="card">
      <table class="w-full">
        <thead>
          <tr class="border-b border-indigo-900/30">
            <th class="text-left p-3 text-gray-400 font-medium">名称</th>
            <th class="text-left p-3 text-gray-400 font-medium">状态</th>
            <th class="text-left p-3 text-gray-400 font-medium">创建时间</th>
            <th class="text-left p-3 text-gray-400 font-medium">最后使用</th>
            <th class="text-left p-3 text-gray-400 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="key in apiKeys"
            :key="key.id"
            class="border-b border-indigo-900/20"
          >
            <td class="p-3">{{ key.name }}</td>
            <td class="p-3">
              <span
                class="px-2 py-1 text-xs rounded"
                :class="key.status === 'active' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'"
              >
                {{ formatStatus(key.status) }}
              </span>
            </td>
            <td class="p-3 text-sm text-gray-400">{{ formatDate(key.createdAt) }}</td>
            <td class="p-3 text-sm text-gray-400">{{ key.lastUsed ? formatDate(key.lastUsed) : '从未' }}</td>
            <td class="p-3">
              <button @click="toggleKey(key.id)" class="text-indigo-400 hover:text-indigo-300 mr-3">
                {{ key.status === 'active' ? '禁用' : '启用' }}
              </button>
              <button @click="deleteKey(key.id)" class="text-red-400 hover:text-red-300">
                删除
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="!apiKeys.length" class="p-8 text-center text-gray-400">
        暂无 API Key，创建一个开始使用 API。
      </div>
    </div>

    <div v-if="showCreateModal" class="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
      <div class="card p-6 w-full max-w-md">
        <h3 class="text-lg font-semibold mb-4">创建 API Key</h3>

        <div v-if="createdKey">
          <div class="bg-red-900/20 border border-red-900/50 p-4 rounded-lg mb-4">
            <p class="text-sm text-red-400 mb-2">请立即复制此 Key，之后将无法再次查看。</p>
            <code class="text-xs break-all text-white">{{ createdKey }}</code>
          </div>
          <button @click="showCreateModal = false" class="btn-primary w-full">完成</button>
        </div>

        <div v-else>
          <div class="mb-4">
            <label class="block text-sm text-gray-400 mb-1">Key 名称</label>
            <input v-model="newKeyName" type="text" class="w-full" placeholder="例如：OpenCode、Chatbox" />
          </div>
          <div class="flex gap-2">
            <button @click="createKey" class="btn-primary flex-1" :disabled="!newKeyName">创建</button>
            <button @click="showCreateModal = false" class="btn-secondary flex-1">取消</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>