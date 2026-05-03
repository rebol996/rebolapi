<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '../stores/api';
import type { UsageLog } from '../types';

const logs = ref<UsageLog[]>([]);
const loading = ref(true);
const limit = 20;

onMounted(async () => {
  await fetchLogs();
});

async function fetchLogs() {
  try {
    const { data } = await api.get('/usage-logs', { params: { limit } });
    logs.value = data;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

function formatDate(date: string): string {
  return new Date(date).toLocaleString('zh-CN');
}

function formatStatus(status: string): string {
  return status === 'success' ? '成功' : '失败';
}
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold mb-6">调用日志</h2>

    <div v-if="loading" class="text-gray-400">加载中...</div>

    <div v-else class="card overflow-hidden">
      <table class="w-full">
        <thead>
          <tr class="border-b border-indigo-900/30">
            <th class="text-left p-3 text-gray-400 font-medium">时间</th>
            <th class="text-left p-3 text-gray-400 font-medium">模型</th>
            <th class="text-left p-3 text-gray-400 font-medium">输入</th>
            <th class="text-left p-3 text-gray-400 font-medium">输出</th>
            <th class="text-left p-3 text-gray-400 font-medium">费用</th>
            <th class="text-left p-3 text-gray-400 font-medium">耗时</th>
            <th class="text-left p-3 text-gray-400 font-medium">状态</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="log in logs"
            :key="log.id"
            class="border-b border-indigo-900/20"
          >
            <td class="p-3 text-sm text-gray-400">{{ formatDate(log.createdAt) }}</td>
            <td class="p-3">
              <p class="text-sm">{{ log.model?.name }}</p>
              <p class="text-xs text-gray-500">{{ log.model?.provider?.name }}</p>
            </td>
            <td class="p-3 text-sm">{{ log.inputTokens }}</td>
            <td class="p-3 text-sm">{{ log.outputTokens }}</td>
            <td class="p-3 text-sm">${{ log.cost.toFixed(4) }}</td>
            <td class="p-3 text-sm">{{ log.duration }}ms</td>
            <td class="p-3">
              <span
                class="px-2 py-1 text-xs rounded"
                :class="log.status === 'success' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'"
              >
                {{ formatStatus(log.status) }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="!logs.length" class="p-8 text-center text-gray-400">
        暂无调用记录
      </div>
    </div>
  </div>
</template>