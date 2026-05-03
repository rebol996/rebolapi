<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '../stores/api';
import type { Model } from '../types';

const models = ref<Model[]>([]);
const loading = ref(true);

onMounted(async () => {
  try {
    const { data } = await api.get('/models');
    models.value = data;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
});

function parseCapability(cap: string | string[]): string[] {
  if (Array.isArray(cap)) return cap;
  try {
    return JSON.parse(cap);
  } catch {
    return [];
  }
}

function formatStatus(status: string): string {
  return status === 'active' ? '启用' : '禁用';
}
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold mb-6">可用模型</h2>

    <div v-if="loading" class="text-gray-400">加载中...</div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="model in models"
        :key="model.id"
        class="card p-4"
      >
        <div class="flex items-start justify-between mb-3">
          <div>
            <h3 class="font-semibold">{{ model.name }}</h3>
            <p class="text-sm text-gray-400">{{ model.provider?.name }}</p>
          </div>
          <span
            class="px-2 py-1 text-xs rounded"
            :class="model.status === 'active' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'"
          >
            {{ formatStatus(model.status) }}
          </span>
        </div>

        <div class="text-xs text-gray-500 mb-3">
          <p>模型 ID: {{ model.modelId }}</p>
          <p>上下文: {{ model.contextLength.toLocaleString() }} tokens</p>
        </div>

        <div class="flex flex-wrap gap-1 mb-3">
          <span
            v-for="cap in parseCapability(model.capability)"
            :key="cap"
            class="px-2 py-0.5 text-xs bg-indigo-900/30 text-indigo-300 rounded"
          >
            {{ cap }}
          </span>
        </div>

        <div class="text-sm text-gray-400">
          <span class="text-green-400">${{ model.inputPrice }}</span> / 1K 输入
          <span class="mx-2">|</span>
          <span class="text-purple-400">${{ model.outputPrice }}</span> / 1K 输出
        </div>
      </div>
    </div>

    <div v-if="!loading && !models.length" class="card p-8 text-center text-gray-400">
      暂无可用模型，请联系管理员获取权限。
    </div>
  </div>
</template>