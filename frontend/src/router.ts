import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from './stores/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('./views/Login.vue'),
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('./views/Register.vue'),
    },
    {
      path: '/',
      component: () => import('./views/Layout.vue'),
      children: [
        {
          path: '',
          name: 'dashboard',
          component: () => import('./views/Dashboard.vue'),
        },
        {
          path: 'chat',
          name: 'chat',
          component: () => import('./views/Chat.vue'),
        },
        {
          path: 'models',
          name: 'models',
          component: () => import('./views/Models.vue'),
        },
        {
          path: 'api-keys',
          name: 'api-keys',
          component: () => import('./views/ApiKeys.vue'),
        },
        {
          path: 'logs',
          name: 'logs',
          component: () => import('./views/Logs.vue'),
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('./views/Settings.vue'),
        },
        {
          path: 'tools',
          name: 'tools',
          component: () => import('./views/Tools.vue'),
        },
      ],
      meta: { requiresAuth: true },
    },
    {
      path: '/admin',
      component: () => import('./views/Layout.vue'),
      children: [
        {
          path: '',
          redirect: '/admin/dashboard',
        },
        {
          path: 'dashboard',
          name: 'admin-dashboard',
          component: () => import('./views/admin/Dashboard.vue'),
        },
        {
          path: 'users',
          name: 'admin-users',
          component: () => import('./views/admin/Users.vue'),
        },
        {
          path: 'providers',
          name: 'admin-providers',
          component: () => import('./views/admin/Providers.vue'),
        },
        {
          path: 'models',
          name: 'admin-models',
          component: () => import('./views/admin/Models.vue'),
        },
        {
          path: 'permissions',
          name: 'admin-permissions',
          component: () => import('./views/admin/Permissions.vue'),
        },
        {
          path: 'quota',
          name: 'admin-quota',
          component: () => import('./views/admin/Quota.vue'),
        },
        {
          path: 'invites',
          name: 'admin-invites',
          component: () => import('./views/admin/Invites.vue'),
        },
      ],
      meta: { requiresAuth: true, requiresAdmin: true },
    },
  ],
});

router.beforeEach(async (to, _from, next) => {
  const auth = useAuthStore();

  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        await auth.fetchMe();
      } catch {
        localStorage.removeItem('token');
        next('/login');
        return;
      }
    }
    next('/login');
  } else if (to.meta.requiresAdmin && auth.user?.role !== 'admin') {
    next('/');
  } else {
    next();
  }
});

export default router;