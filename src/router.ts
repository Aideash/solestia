import { createRouter, createWebHistory } from 'vue-router'
import PlanetSystemPage from './views/PlanetSystemPage.vue'
import SolarSystemPage from './views/SolarSystemPage.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'solar', component: SolarSystemPage },
    {
      path: '/earth',
      name: 'earth-system',
      component: PlanetSystemPage,
      props: { systemId: 'earth' },
      meta: { subtitle: 'Earth' },
    },
    {
      path: '/jupiter',
      name: 'jupiter-system',
      component: PlanetSystemPage,
      props: { systemId: 'jupiter' },
      meta: { subtitle: 'Jupiter' },
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
