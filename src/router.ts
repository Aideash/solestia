import { createRouter, createWebHistory } from 'vue-router'
import PlanetSystemPage from './views/PlanetSystemPage.vue'
import SolarSystemPage from './views/SolarSystemPage.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'solar', component: SolarSystemPage },
    {
      path: '/asteroid-belt',
      name: 'asteroid-belt',
      component: () => import('./views/AsteroidBeltPage.vue'),
      meta: { subtitle: 'Asteroid belt' },
    },
    {
      path: '/kuiper-belt',
      name: 'kuiper-belt',
      component: () => import('./views/KuiperBeltPage.vue'),
      meta: { subtitle: 'Kuiper belt' },
    },
    {
      path: '/earth',
      name: 'earth-system',
      component: PlanetSystemPage,
      props: { systemId: 'earth' },
      meta: { subtitle: 'Earth' },
    },
    {
      path: '/earth/time',
      name: 'earth-time',
      component: () => import('./views/EarthTimePage.vue'),
      meta: { subtitle: 'Earth · time' },
    },
    {
      path: '/jupiter',
      name: 'jupiter-system',
      component: PlanetSystemPage,
      props: { systemId: 'jupiter' },
      meta: { subtitle: 'Jupiter' },
    },
    {
      path: '/saturn',
      name: 'saturn-system',
      component: PlanetSystemPage,
      props: { systemId: 'saturn' },
      meta: { subtitle: 'Saturn' },
    },
    {
      path: '/uranus',
      name: 'uranus-system',
      component: PlanetSystemPage,
      props: { systemId: 'uranus' },
      meta: { subtitle: 'Uranus' },
    },
    {
      path: '/neptune',
      name: 'neptune-system',
      component: PlanetSystemPage,
      props: { systemId: 'neptune' },
      meta: { subtitle: 'Neptune' },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
