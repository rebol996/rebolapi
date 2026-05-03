<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '../../stores/api';

const stats = ref<any>(null);
const loading = ref(true);

onMounted(async () => {
  try {
    const { data } = await api.get('/dashboard/admin');
    stats.value = data;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
});

function formatCost(cost: number): string {
  return cost.toFixed(4);
}
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold mb-6">管理员控制台</h2>

    <div v-if="loading" class="text-gray-400">加载中...</div>

    <div v-else-if="stats" class="space-y-6">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="card p-5">
          <div class="text-gray-400 text-sm mb-1">今日调用次数</div>
          <div class="text-3xl font-bold">{{ stats.todayCalls }}</div>
        </div>
        <div class="card p-5">
          <div class="text-gray-400 text-sm mb-1">今日 Token 消耗</div>
          <div class="text-3xl font-bold">{{ stats.todayTokens.toLocaleString() }}</div>
        </div>
        <div class="card p-5">
          <div class="text-gray-400 text-sm mb-1">今日估算费用</div>
          <div class="text-3xl font-bold">${{ formatCost(stats.todayCost) }}</div>
        </div>
        <div class="card p-5">
          <div class="text-gray-400 text-sm mb-1">启用模型数</div>
          <div class="text-3xl font-bold">{{ stats.totalModels }}</div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="card p-5">
          <h3 class="text-lg font-semibold mb-4">最近调用记录</h3>
          <div class="space-y-3">
            <div
              v-for="log in stats.recentLogs"
              :key="log.id"
              class="flex items-center justify-between py-2 border-b border-indigo-900/30"
            >
              <div>
                <p class="text-sm font-medium">{{ log.user?.username }}</p>
                <p class="text-xs text-gray-500">{{ log.model?.name }} / {{ log.model?.provider?.name }}</p>
              </div>
              <div class="text-right">
                <p class="text-sm">${{ formatCost(log.cost) }}</p>
                <p class="text-xs text-gray-500">{{ log.duration }}ms</p>
              </div>
            </div>
          </div>
        </div>

        <div class="card p-5">
          <h3 class="text-lg font-semibold mb-4">用户用量排行</h3>
          <div class="space-y-2">
            <div
              v-for="user in stats.topUsers"
              :key="user.id"
              class="flex items-center justify-between py-2 border-b border-indigo-900/30"
            >
              <span class="text-sm">{{ user.username }}</span>
              <span class="text-sm text-gray-400">${{ formatCost(user.quota) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>