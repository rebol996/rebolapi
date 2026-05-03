<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '../../stores/api';
import type { User, QuotaRecord } from '../../types';

const users = ref<User[]>([]);
const records = ref<QuotaRecord[]>([]);
const selectedUser = ref('');
const amount = ref(0);
const reason = ref('');
const loading = ref(true);

onMounted(async () => {
  try {
    const [usersRes, recordsRes] = await Promise.all([
      api.get('/admin/users'),
      api.get('/quota/records'),
    ]);
    users.value = usersRes.data;
    records.value = recordsRes.data;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
});

async function addQuota() {
  if (!selectedUser.value || amount.value === 0) return;
  try {
    await api.post('/admin/quota', {
      userId: selectedUser.value,
      amount: amount.value,
      reason: reason.value || '手动调整',
    });
    const [usersRes, recordsRes] = await Promise.all([
      api.get('/admin/users'),
      api.get('/quota/records'),
    ]);
    users.value = usersRes.data;
    records.value = recordsRes.data;
    amount.value = 0;
    reason.value = '';
  } catch (e) {
    console.error(e);
  }
}

async function resetQuota() {
  if (!selectedUser.value) return;
  if (!confirm('确定将此用户额度重置为0？')) return;
  await api.post('/admin/quota/reset', { userId: selectedUser.value });
  const { data } = await api.get('/admin/users');
  users.value = data;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleString('zh-CN');
}
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold mb-6">额度管理</h2>

    <div v-if="loading" class="text-gray-400">加载中...</div>

    <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="card p-6">
        <h3 class="text-lg font-semibold mb-4">调整额度</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm text-gray-400 mb-1">用户</label>
            <select v-model="selectedUser" class="w-full">
              <option value="">请选择用户...</option>
              <option v-for="u in users" :key="u.id" :value="u.id">
                {{ u.username }} (当前: ${{ u.quota.toFixed(4) }})
              </option>
            </select>
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-1">调整金额（负数表示扣除）</label>
            <input v-model.number="amount" type="number" step="0.01" class="w-full" />
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-1">原因</label>
            <input v-model="reason" type="text" class="w-full" placeholder="可选备注" />
          </div>
          <div class="flex gap-2">
            <button @click="addQuota" class="btn-primary" :disabled="!selectedUser">增加额度</button>
            <button @click="resetQuota" class="btn-secondary" :disabled="!selectedUser">重置为0</button>
          </div>
        </div>
      </div>

      <div class="card p-6">
        <h3 class="text-lg font-semibold mb-4">用户余额</h3>
        <div class="space-y-2">
          <div v-for="u in users" :key="u.id" class="flex justify-between py-2 border-b border-indigo-900/20">
            <span>{{ u.username }}</span>
            <span class="text-gray-400">${{ u.quota.toFixed(4) }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="mt-6 card p-6">
      <h3 class="text-lg font-semibold mb-4">额度记录</h3>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-indigo-900/30">
              <th class="text-left p-3 text-gray-400 font-medium">时间</th>
              <th class="text-left p-3 text-gray-400 font-medium">用户</th>
              <th class="text-left p-3 text-gray-400 font-medium">金额</th>
              <th class="text-left p-3 text-gray-400 font-medium">原因</th>
              <th class="text-left p-3 text-gray-400 font-medium">操作人</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in records" :key="r.id" class="border-b border-indigo-900/20">
              <td class="p-3 text-sm text-gray-400">{{ formatDate(r.createdAt) }}</td>
              <td class="p-3 text-sm">{{ r.user?.username }}</td>
              <td class="p-3 text-sm" :class="r.amount >= 0 ? 'text-green-400' : 'text-red-400'">
                {{ r.amount >= 0 ? '+' : '' }}{{ r.amount.toFixed(4) }}
              </td>
              <td class="p-3 text-sm text-gray-400">{{ r.reason }}</td>
              <td class="p-3 text-sm">{{ r.operator?.username }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>