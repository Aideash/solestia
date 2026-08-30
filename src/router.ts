import { createRouter, createWebHistory } from 'vue-router'
import JupiterSystemPage from './views/JupiterSystemPage.vue'
import SolarSystemPage from './views/SolarSystemPage.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'solar', component: SolarSystemPage },
    { path: '/jupiter', name: 'jupiter', component: JupiterSystemPage },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
