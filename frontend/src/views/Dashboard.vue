<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useAuthStore } from '../stores/auth';
import api from '../stores/api';

const auth = useAuthStore();
const stats = ref<any>(null);
const loading = ref(true);
const isAdmin = computed(() => auth.user?.role === 'admin');

onMounted(async () => {
  try {
    const endpoint = isAdmin.value ? '/dashboard/admin' : '/dashboard/member';
    const { data } = await api.get(endpoint);
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

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}秒`;
}
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold mb-6">{{ isAdmin ? '管理员控制台' : '我的控制台' }}</h2>

    <div v-if="loading" class="text-gray-400">加载中...</div>

    <div v-else-if="stats" class="space-y-6">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <template v-if="isAdmin">
          <div class="card p-5">
            <div class="text-gray-400 text-sm mb-1">今日调用次数</div>
            <div class="text-3xl font-bold">{{ stats.todayCalls || 0 }}</div>
          </div>
          <div class="card p-5">
            <div class="text-gray-400 text-sm mb-1">今日 Token 消耗</div>
            <div class="text-3xl font-bold">{{ (stats.todayTokens || 0).toLocaleString() }}</div>
          </div>
          <div class="card p-5">
            <div class="text-gray-400 text-sm mb-1">今日估算费用</div>
            <div class="text-3xl font-bold">${{ formatCost(stats.todayCost || 0) }}</div>
          </div>
          <div class="card p-5">
            <div class="text-gray-400 text-sm mb-1">启用模型数</div>
            <div class="text-3xl font-bold">{{ stats.totalModels || 0 }}</div>
          </div>
        </template>
        <template v-else>
          <div class="card p-5">
            <div class="text-gray-400 text-sm mb-1">我的余额</div>
            <div class="text-3xl font-bold text-green-400">${{ (stats.quota || 0).toFixed(4) }}</div>
          </div>
          <div class="card p-5">
            <div class="text-gray-400 text-sm mb-1">今日调用次数</div>
            <div class="text-3xl font-bold">{{ stats.todayCalls || 0 }}</div>
          </div>
          <div class="card p-5">
            <div class="text-gray-400 text-sm mb-1">今日 Token 消耗</div>
            <div class="text-3xl font-bold">{{ (stats.todayTokens || 0).toLocaleString() }}</div>
          </div>
          <div class="card p-5">
            <div class="text-gray-400 text-sm mb-1">可用模型数</div>
            <div class="text-3xl font-bold">{{ stats.availableModels || 0 }}</div>
          </div>
        </template>
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
                <p class="text-sm font-medium">{{ log.user?.username || log.model?.name }}</p>
                <p class="text-xs text-gray-500">{{ log.model?.provider?.name }}</p>
              </div>
              <div class="text-right">
                <p class="text-sm">${{ (log.cost || 0).toFixed(4) }}</p>
                <p class="text-xs text-gray-500">{{ formatTime(log.duration || 0) }}</p>
              </div>
            </div>
            <div v-if="!stats.recentLogs?.length" class="text-gray-500 text-sm">暂无调用记录</div>
          </div>
        </div>

        <div v-if="!isAdmin && stats.defaultModel" class="card p-5">
          <h3 class="text-lg font-semibold mb-4">默认模型</h3>
          <div class="space-y-2">
            <div class="flex justify-between">
              <span class="text-gray-400">名称</span>
              <span>{{ stats.defaultModel.name }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-400">供应商</span>
              <span>{{ stats.defaultModel.provider?.name }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-400">上下文</span>
              <span>{{ (stats.defaultModel.contextLength || 0).toLocaleString() }} tokens</span>
            </div>
          </div>
        </div>

        <div v-if="isAdmin && stats.topUsers?.length" class="card p-5">
          <h3 class="text-lg font-semibold mb-4">用户用量排行</h3>
          <div class="space-y-2">
            <div
              v-for="user in stats.topUsers"
              :key="user.id"
              class="flex items-center justify-between py-2 border-b border-indigo-900/30"
            >
              <span class="text-sm">{{ user.username }}</span>
              <span class="text-sm text-gray-400">${{ formatCost(user.quota || 0) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>