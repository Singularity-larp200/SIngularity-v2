import { createRouter, createWebHistory } from 'vue-router'
import Home from '@/pages/Home.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: Home,
    },
    {
      path: '/games',
      name: 'games',
      component: () => import('@/pages/Games.vue'),
    },
    {
      path: '/chat',
      name: 'chat',
      component: () => import('@/pages/Chat.vue'),
    },
    {
      path: '/ai',
      name: 'ai',
      component: () => import('@/pages/AI.vue'),
    }
  ],
})

export default router