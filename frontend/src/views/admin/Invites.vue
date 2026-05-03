<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '../../stores/api';
import type { InviteCode } from '../../types';

const invites = ref<InviteCode[]>([]);
const loading = ref(true);
const newCodeDays = ref(30);
const showCreateModal = ref(false);
const createdCode = ref('');

onMounted(async () => {
  await fetchInvites();
});

async function fetchInvites() {
  try {
    const { data } = await api.get('/invite-codes');
    invites.value = data;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

async function createInvite() {
  try {
    const { data } = await api.post('/invite-codes', { days: newCodeDays.value });
    createdCode.value = data.code;
    showCreateModal.value = true;
    await fetchInvites();
  } catch (e) {
    console.error(e);
  }
}

async function deleteInvite(id: string) {
  if (!confirm('确定删除此邀请码？')) return;
  await api.delete(`/invite-codes/${id}`);
  await fetchInvites();
}

function formatDate(date: string): string {
  return new Date(date).toLocaleString('zh-CN');
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

function getStatus(invite: InviteCode): { text: string; class: string } {
  if (invite.usedBy) return { text: '已使用', class: 'bg-gray-900/50 text-gray-400' };
  if (isExpired(invite.expiresAt)) return { text: '已过期', class: 'bg-red-900/30 text-red-400' };
  return { text: '有效', class: 'bg-green-900/30 text-green-400' };
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-bold">邀请码管理</h2>
      <button @click="showCreateModal = true; createdCode = ''" class="btn-primary">创建邀请码</button>
    </div>

    <div v-if="loading" class="text-gray-400">加载中...</div>

    <div v-else class="card">
      <table class="w-full">
        <thead>
          <tr class="border-b border-indigo-900/30">
            <th class="text-left p-3 text-gray-400 font-medium">邀请码</th>
            <th class="text-left p-3 text-gray-400 font-medium">状态</th>
            <th class="text-left p-3 text-gray-400 font-medium">创建时间</th>
            <th class="text-left p-3 text-gray-400 font-medium">过期时间</th>
            <th class="text-left p-3 text-gray-400 font-medium">使用者</th>
            <th class="text-left p-3 text-gray-400 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="inv in invites" :key="inv.id" class="border-b border-indigo-900/20">
            <td class="p-3">
              <code class="text-sm text-green-400">{{ inv.code }}</code>
            </td>
            <td class="p-3">
              <span class="px-2 py-1 text-xs rounded" :class="getStatus(inv).class">
                {{ getStatus(inv).text }}
              </span>
            </td>
            <td class="p-3 text-sm text-gray-400">{{ formatDate(inv.createdAt) }}</td>
            <td class="p-3 text-sm text-gray-400">{{ formatDate(inv.expiresAt) }}</td>
            <td class="p-3 text-sm text-gray-400">{{ inv.usedBy ? inv.usedBy : '-' }}</td>
            <td class="p-3">
              <button
                v-if="!inv.usedBy"
                @click="deleteInvite(inv.id)"
                class="text-red-400 hover:text-red-300"
              >
                删除
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="showCreateModal" class="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
      <div class="card p-6 w-full max-w-md">
        <h3 class="text-lg font-semibold mb-4">创建邀请码</h3>

        <div v-if="createdCode">
          <div class="bg-green-900/20 border border-green-900/50 p-4 rounded-lg mb-4">
            <p class="text-sm text-green-400 mb-2">将此邀请码分享给朋友：</p>
            <code class="text-lg text-white">{{ createdCode }}</code>
          </div>
          <button @click="showCreateModal = false" class="btn-primary w-full">完成</button>
        </div>

        <div v-else>
          <div class="mb-4">
            <label class="block text-sm text-gray-400 mb-1">有效期（天）</label>
            <input v-model.number="newCodeDays" type="number" class="w-full" min="1" />
          </div>
          <div class="flex gap-2">
            <button @click="createInvite" class="btn-primary flex-1">创建</button>
            <button @click="showCreateModal = false" class="btn-secondary flex-1">取消</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>