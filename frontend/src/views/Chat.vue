<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '../stores/api';
import axios from 'axios';
import { useAuthStore } from '../stores/auth';
import type { Model } from '../types';

const auth = useAuthStore();
const models = ref<Model[]>([]);
const selectedModel = ref('');
const messages = ref<{ role: string; content: string }[]>([]);
const inputMessage = ref('');
const loading = ref(false);
const error = ref('');
const stats = ref<{ inputTokens: number; outputTokens: number; cost: number; duration: number } | null>(null);

const v1Api = axios.create({ baseURL: '/v1' });

onMounted(async () => {
  try {
    const { data } = await api.get('/models');
    models.value = data;
    const defaultModel = data.find((m: Model) => m.isDefault);
    if (defaultModel) selectedModel.value = defaultModel.modelId;
  } catch (e) {
    console.error(e);
  }
});

const canSend = computed(() => {
  return selectedModel.value && inputMessage.value.trim() && auth.user?.quota && auth.user.quota > 0;
});

async function sendMessage() {
  if (!canSend.value) return;

  const userMessage = inputMessage.value.trim();
  messages.value.push({ role: 'user', content: userMessage });
  inputMessage.value = '';
  error.value = '';
  loading.value = true;
  stats.value = null;

  try {
    const startTime = Date.now();
    const { data } = await v1Api.post('/v1/chat/completions', {
      model: selectedModel.value,
      messages: messages.value,
    });

    const duration = Date.now() - startTime;
    messages.value.push({
      role: 'assistant',
      content: data.choices[0]?.message?.content || '无回复',
    });

    stats.value = {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
      cost: data.usage ? (data.usage.prompt_tokens * 0.001 + data.usage.completion_tokens * 0.002) : 0,
      duration,
    };
  } catch (e: any) {
    error.value = e.response?.data?.error?.message || e.message || '请求失败';
  } finally {
    loading.value = false;
  }
}

function clearChat() {
  messages.value = [];
  stats.value = null;
}
</script>

<template>
  <div class="flex flex-col h-[calc(100vh-8rem)]">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-2xl font-bold">聊天测试</h2>
      <div class="flex items-center gap-4">
        <select v-model="selectedModel" class="min-w-[200px]">
          <option value="">选择模型</option>
          <option v-for="m in models" :key="m.id" :value="m.modelId">
            {{ m.name }} ({{ m.provider?.name }})
          </option>
        </select>
        <button @click="clearChat" class="btn-secondary text-sm">清空</button>
      </div>
    </div>

    <div class="flex-1 card p-4 overflow-auto mb-4">
      <div class="space-y-4">
        <div
          v-for="(msg, i) in messages"
          :key="i"
          class="flex"
          :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
        >
          <div
            class="max-w-[70%] p-3 rounded-lg"
            :class="msg.role === 'user' ? 'bg-indigo-900/50' : 'bg-gray-800/50'"
          >
            <p class="text-sm whitespace-pre-wrap">{{ msg.content }}</p>
          </div>
        </div>
      </div>

      <div v-if="loading" class="text-center py-4 text-gray-400">
        <span class="animate-pulse">正在发送请求...</span>
      </div>

      <div v-if="error" class="text-center py-4 text-red-400">
        {{ error }}
      </div>
    </div>

    <div v-if="stats" class="card p-3 mb-4 flex gap-6 text-sm">
      <div>
        <span class="text-gray-400">输入:</span>
        <span class="ml-2">{{ stats.inputTokens }} tokens</span>
      </div>
      <div>
        <span class="text-gray-400">输出:</span>
        <span class="ml-2">{{ stats.outputTokens }} tokens</span>
      </div>
      <div>
        <span class="text-gray-400">耗时:</span>
        <span class="ml-2">{{ stats.duration }}ms</span>
      </div>
      <div>
        <span class="text-gray-400">估算费用:</span>
        <span class="ml-2">${{ stats.cost.toFixed(4) }}</span>
      </div>
    </div>

    <div class="flex gap-2">
      <input
        v-model="inputMessage"
        type="text"
        placeholder="输入消息..."
        class="flex-1"
        :disabled="loading || !selectedModel"
        @keyup.enter="sendMessage"
      />
      <button
        @click="sendMessage"
        class="btn-primary px-6"
        :disabled="loading || !canSend"
      >
        发送
      </button>
    </div>

    <div v-if="auth.user?.quota !== undefined" class="mt-2 text-sm text-gray-400">
      当前余额: <span class="text-white">${{ auth.user.quota.toFixed(4) }}</span>
    </div>
  </div>
</template>