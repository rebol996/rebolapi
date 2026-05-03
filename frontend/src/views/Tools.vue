<script setup lang="ts">
import { ref, computed } from 'vue';

const baseUrl = ref(`${window.location.origin}/v1`);

const curlExample = computed(() => `curl ${baseUrl.value}/chat/completions ^
  -H "Content-Type: application/json" ^
  -H "x-api-key: YOUR_API_KEY" ^
  -d "{\\"model\\":\\"deepseek-chat\\",\\"messages\\":[{\\"role\\":\\"user\\",\\"content\\":\\"Hello!\\"}]}"`);

const openCodeConfig = computed(() => ({
  url: baseUrl.value,
  apiKey: 'YOUR_API_KEY',
}));
</script>

<template>
  <div class="space-y-6">
    <h2 class="text-2xl font-bold">接入工具</h2>

    <div class="card p-6">
      <h3 class="text-lg font-semibold mb-4">接口地址</h3>
      <code class="block bg-gray-900 p-3 rounded text-sm text-green-400">{{ baseUrl }}</code>
    </div>

    <div class="card p-6">
      <h3 class="text-lg font-semibold mb-4">OpenCode 配置</h3>
      <div class="space-y-3 text-sm">
        <div>
          <span class="text-gray-400">API 地址:</span>
          <code class="ml-2 text-green-400">{{ openCodeConfig.url }}</code>
        </div>
        <div>
          <span class="text-gray-400">API Key:</span>
          <code class="ml-2 text-yellow-400">YOUR_API_KEY</code>
        </div>
      </div>
    </div>

    <div class="card p-6">
      <h3 class="text-lg font-semibold mb-4">curl 请求示例</h3>
      <pre class="bg-gray-900 p-4 rounded text-sm overflow-x-auto"><code class="text-gray-300">{{ curlExample }}</code></pre>
    </div>

    <div class="card p-6">
      <h3 class="text-lg font-semibold mb-4">Chatbox / Cherry Studio 配置</h3>
      <div class="space-y-2 text-sm">
        <div>
          <span class="text-gray-400">API Base:</span>
          <code class="ml-2 text-green-400">{{ baseUrl }}</code>
        </div>
        <div>
          <span class="text-gray-400">API Key:</span>
          <code class="ml-2 text-yellow-400">YOUR_API_KEY</code>
        </div>
      </div>
    </div>

    <div class="card p-6">
      <h3 class="text-lg font-semibold mb-2">重要说明</h3>
      <ul class="text-sm text-gray-400 space-y-1">
        <li>• 请将 <code class="text-yellow-400">YOUR_API_KEY</code> 替换为从 API Key 页面获取的真实 Key</li>
        <li>• 只能使用您有权限访问的模型</li>
        <li>• 发起请求前请确认余额充足</li>
      </ul>
    </div>
  </div>
</template>