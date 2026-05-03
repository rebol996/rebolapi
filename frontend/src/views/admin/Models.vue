<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '../../stores/api';
import type { Model, Provider } from '../../types';

const models = ref<Model[]>([]);
const providers = ref<Provider[]>([]);
const loading = ref(true);
const showModal = ref(false);
const editingModel = ref<Model | null>(null);
const formData = ref({
  name: '',
  modelId: '',
  providerId: '',
  contextLength: 4096,
  inputPrice: 0,
  outputPrice: 0,
  capability: [] as string[],
  status: 'active',
  isDefault: false,
});

onMounted(async () => {
  await Promise.all([fetchModels(), fetchProviders()]);
});

async function fetchModels() {
  try {
    const { data } = await api.get('/models');
    models.value = data;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

async function fetchProviders() {
  const { data } = await api.get('/providers');
  providers.value = data;
}

function openCreate() {
  editingModel.value = null;
  formData.value = { name: '', modelId: '', providerId: '', contextLength: 4096, inputPrice: 0, outputPrice: 0, capability: [], status: 'active', isDefault: false };
  showModal.value = true;
}

function openEdit(model: Model) {
  editingModel.value = model;
  let caps: string[] = [];
  try { caps = JSON.parse(model.capability as any); } catch {}
  formData.value = { name: model.name, modelId: model.modelId, providerId: model.providerId, contextLength: model.contextLength, inputPrice: model.inputPrice, outputPrice: model.outputPrice, capability: caps, status: model.status, isDefault: model.isDefault };
  showModal.value = true;
}

async function saveModel() {
  try {
    if (editingModel.value) {
      await api.put(`/models/${editingModel.value.id}`, formData.value);
    } else {
      await api.post('/models', formData.value);
    }
    showModal.value = false;
    await fetchModels();
  } catch (e) {
    console.error(e);
  }
}

async function deleteModel(id: string) {
  if (!confirm('确定删除此模型？')) return;
  await api.delete(`/models/${id}`);
  await fetchModels();
}

const capabilityOptions = ['代码', '长文本', '便宜', '快速', '推理', '多模态'];

function formatStatus(status: string): string {
  return status === 'active' ? '启用' : '禁用';
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-bold">模型管理</h2>
      <button @click="openCreate" class="btn-primary">新增模型</button>
    </div>

    <div v-if="loading" class="text-gray-400">加载中...</div>

    <div v-else class="grid gap-4">
      <div v-for="m in models" :key="m.id" class="card p-4">
        <div class="flex items-start justify-between">
          <div>
            <h3 class="font-semibold">{{ m.name }}</h3>
            <p class="text-sm text-gray-400">ID: {{ m.modelId }}</p>
            <p class="text-xs text-gray-500">供应商: {{ m.provider?.name }}</p>
          </div>
          <div class="flex items-center gap-2">
            <span
              class="px-2 py-1 text-xs rounded"
              :class="m.status === 'active' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'"
            >
              {{ formatStatus(m.status) }}
            </span>
            <span v-if="m.isDefault" class="px-2 py-1 text-xs rounded bg-blue-900/30 text-blue-400">默认</span>
          </div>
        </div>
        <div class="mt-3 text-sm text-gray-400">
          <span class="text-green-400">${{ m.inputPrice }}</span>/1K 输入,
          <span class="text-purple-400">${{ m.outputPrice }}</span>/1K 输出
        </div>
        <div class="mt-4 flex gap-2">
          <button @click="openEdit(m)" class="btn-secondary text-sm">编辑</button>
          <button @click="deleteModel(m.id)" class="text-red-400 hover:text-red-300 text-sm">删除</button>
        </div>
      </div>
    </div>

    <div v-if="showModal" class="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
      <div class="card p-6 w-full max-w-lg">
        <h3 class="text-lg font-semibold mb-4">{{ editingModel ? '编辑模型' : '新增模型' }}</h3>
        <form @submit.prevent="saveModel" class="space-y-4">
          <div>
            <label class="block text-sm text-gray-400 mb-1">显示名称</label>
            <input v-model="formData.name" type="text" class="w-full" required />
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-1">真实模型 ID</label>
            <input v-model="formData.modelId" type="text" class="w-full" required />
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-1">所属供应商</label>
            <select v-model="formData.providerId" class="w-full" required>
              <option value="">请选择供应商</option>
              <option v-for="p in providers" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-1">上下文长度</label>
            <input v-model.number="formData.contextLength" type="number" class="w-full" />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm text-gray-400 mb-1">输入价格 ($/1K)</label>
              <input v-model.number="formData.inputPrice" type="number" step="0.0001" class="w-full" />
            </div>
            <div>
              <label class="block text-sm text-gray-400 mb-1">输出价格 ($/1K)</label>
              <input v-model.number="formData.outputPrice" type="number" step="0.0001" class="w-full" />
            </div>
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-1">能力标签</label>
            <div class="flex flex-wrap gap-2">
              <label v-for="cap in capabilityOptions" :key="cap" class="flex items-center gap-1 text-sm">
                <input type="checkbox" :value="cap" v-model="formData.capability" class="rounded" />
                {{ cap }}
              </label>
            </div>
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