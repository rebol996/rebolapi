import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from './api';
import type { User } from '../types';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('token'));
  const user = ref<User | null>(null);

  const isLoggedIn = computed(() => !!token.value);
  const isAdmin = computed(() => user.value?.role === 'admin');

  async function login(username: string, password: string) {
    const { data } = await api.post('/auth/login', { username, password });
    token.value = data.token;
    user.value = data.user;
    localStorage.setItem('token', data.token);
    return data;
  }

  async function register(username: string, password: string, inviteCode: string) {
    const { data } = await api.post('/auth/register', { username, password, inviteCode });
    token.value = data.token;
    user.value = data.user;
    localStorage.setItem('token', data.token);
    return data;
  }

  async function fetchMe() {
    try {
      const { data } = await api.get('/auth/me');
      user.value = data;
      return data;
    } catch {
      logout();
      throw new Error('Session expired');
    }
  }

  async function changePassword(oldPassword: string, newPassword: string) {
    await api.put('/auth/password', { oldPassword, newPassword });
  }

  function logout() {
    token.value = null;
    user.value = null;
    localStorage.removeItem('token');
  }

  return {
    token,
    user,
    isLoggedIn,
    isAdmin,
    login,
    register,
    fetchMe,
    changePassword,
    logout,
  };
});