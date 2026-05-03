<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '../../stores/api';
import type { Provider } from '../../types';

const providers = ref<Provider[]>([]);
const loading = ref(true);
const showModal = ref(false);
const editingProvider = ref<Provider | null>(null);
const formData = ref({
  name: '',
  baseUrl: '',
  apiKey: '',
  type: 'openai-compatible',
  status: 'active',
  remark: '',
});

onMounted(async () => {
  await fetchProviders();
});

async function fetchProviders() {
  try {
    const { data } = await api.get('/providers');
    providers.value = data;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editingProvider.value = null;
  formData.value = { name: '', baseUrl: '', apiKey: '', type: 'openai-compatible', status: 'active', remark: '' };
  showModal.value = true;
}

function openEdit(provider: Provider) {
  editingProvider.value = provider;
  formData.value = { name: provider.name, baseUrl: provider.baseUrl, apiKey: '', type: provider.type, status: provider.status, remark: provider.remark || '' };
  showModal.value = true;
}

async function saveProvider() {
  try {
    if (editingProvider.value) {
      const updateData: any = { ...formData.value };
      if (!updateData.apiKey) delete updateData.apiKey;
      await api.put(`/providers/${editingProvider.value.id}`, updateData);
    } else {
      await api.post('/providers', formData.value);
    }
    showModal.value = false;
    await fetchProviders();
  } catch (e) {
    console.error(e);
  }
}

async function deleteProvider(id: string) {
  if (!confirm('确定删除此供应商？')) return;
  await api.delete(`/providers/${id}`);
  await fetchProviders();
}

async function testProvider(id: string) {
  try {
    const { data } = await api.post(`/providers/${id}/test`);
    alert(`结果: ${data.message}\n响应时间: ${data.responseTime}ms`);
  } catch (e: any) {
    alert(`测试失败: ${e.message}`);
  }
}

function formatStatus(status: string): string {
  return status === 'active' ? '启用' : '禁用';
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-bold">供应商管理</h2>
      <button @click="openCreate" class="btn-primary">新增供应商</button>
    </div>

    <div v-if="loading" class="text-gray-400">加载中...</div>

    <div v-else class="grid gap-4">
      <div v-for="p in providers" :key="p.id" class="card p-4">
        <div class="flex items-start justify-between">
          <div>
            <h3 class="font-semibold text-lg">{{ p.name }}</h3>
            <p class="text-sm text-gray-400">{{ p.baseUrl }}</p>
            <p class="text-xs text-gray-500 mt-1">API Key: {{ p.apiKey }}</p>
          </div>
          <div class="flex items-center gap-2">
            <span
              class="px-2 py-1 text-xs rounded"
              :class="p.status === 'active' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'"
            >
              {{ formatStatus(p.status) }}
            </span>
          </div>
        </div>
        <div class="mt-4 flex gap-2">
          <button @click="testProvider(p.id)" class="btn-secondary text-sm">测试</button>
          <button @click="openEdit(p)" class="btn-secondary text-sm">编辑</button>
          <button @click="deleteProvider(p.id)" class="text-red-400 hover:text-red-300 text-sm">删除</button>
        </div>
      </div>
    </div>

    <div v-if="showModal" class="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
      <div class="card p-6 w-full max-w-lg">
        <h3 class="text-lg font-semibold mb-4">{{ editingProvider ? '编辑供应商' : '新增供应商' }}</h3>
        <form @submit.prevent="saveProvider" class="space-y-4">
          <div>
            <label class="block text-sm text-gray-400 mb-1">供应商名称</label>
            <input v-model="formData.name" type="text" class="w-full" required />
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-1">接口地址</label>
            <input v-model="formData.baseUrl" type="url" class="w-full" placeholder="https://api.example.com" required />
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-1">API 密钥</label>
            <input v-model="formData.apiKey" type="text" class="w-full" :placeholder="editingProvider ? '（留空则保持原值）' : ''" />
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-1">接口类型</label>
            <select v-model="formData.type" class="w-full">
              <option value="openai-compatible">OpenAI Compatible</option>
            </select>
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-1">备注</label>
            <input v-model="formData.remark" type="text" class="w-full" />
          </div>
          <div class="flex gap-2">
            <button type="submit" class="btn-primary flex-1">保存</button>
            <button type="button" @click="showModal = false" class="btn-secondary flex-1">取消</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>