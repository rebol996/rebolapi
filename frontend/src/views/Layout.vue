<script setup lang="ts">
import { computed } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const isAdmin = computed(() => auth.user?.role === 'admin');

const memberNav = [
  { name: '总览', path: '/', icon: '📊' },
  { name: '聊天测试', path: '/chat', icon: '💬' },
  { name: '模型列表', path: '/models', icon: '🤖' },
  { name: 'API Key', path: '/api-keys', icon: '🔑' },
  { name: '调用记录', path: '/logs', icon: '📝' },
  { name: '接入工具', path: '/tools', icon: '🔧' },
  { name: '设置', path: '/settings', icon: '⚙️' },
];

const adminNav = [
  { name: '控制台', path: '/admin/dashboard', icon: '📊' },
  { name: '用户管理', path: '/admin/users', icon: '👥' },
  { name: '供应商', path: '/admin/providers', icon: '☁️' },
  { name: '模型管理', path: '/admin/models', icon: '🤖' },
  { name: '模型权限', path: '/admin/permissions', icon: '🔐' },
  { name: '额度管理', path: '/admin/quota', icon: '💰' },
  { name: '邀请码', path: '/admin/invites', icon: '🎫' },
  { name: '调用记录', path: '/logs', icon: '📝' },
];

const navItems = computed(() => isAdmin.value ? adminNav : memberNav);

function handleLogout() {
  auth.logout();
  router.push('/login');
}
</script>

<template>
  <div class="flex min-h-screen">
    <aside class="w-64 bg-[#0a0a14] border-r border-indigo-900/30 p-4 flex flex-col">
      <div class="mb-8">
        <h1 class="text-xl font-bold gradient-text">Rebol AI</h1>
        <p class="text-xs text-gray-500">半私有 AI 网关平台</p>
      </div>

      <nav class="flex-1 space-y-1">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-indigo-900/20 transition-colors"
          :class="{ 'bg-indigo-900/30 text-white': route.path === item.path }"
        >
          <span>{{ item.icon }}</span>
          <span>{{ item.name }}</span>
        </router-link>
      </nav>

      <div class="border-t border-indigo-900/30 pt-4">
        <div class="px-4 py-2 text-sm text-gray-400">
          <p class="font-medium text-white">{{ auth.user?.username }}</p>
          <p class="text-xs">{{ auth.user?.role === 'admin' ? '管理员' : '普通用户' }}</p>
        </div>
        <button
          @click="handleLogout"
          class="w-full mt-2 px-4 py-2 text-left text-gray-400 hover:text-white hover:bg-indigo-900/20 rounded-lg transition-colors text-sm"
        >
          退出登录
        </button>
      </div>
    </aside>

    <main class="flex-1 overflow-auto">
      <div class="p-6">
        <RouterView />
      </div>
    </main>
  </div>
</template>