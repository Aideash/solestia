import { createRouter, createWebHistory } from 'vue-router'
import PlanetSystemPage from './views/PlanetSystemPage.vue'
import SolarSystemPage from './views/SolarSystemPage.vue'

const ConstellationsPage = () => import('./views/ConstellationsPage.vue')
const HomePage = () => import('./views/HomePage.vue')

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomePage,
      meta: { timeless: true, immersive: true },
    },
    { path: '/orrery', name: 'solar', component: SolarSystemPage },
    {
      path: '/orrery/asteroid-belt',
      name: 'asteroid-belt',
      component: () => import('./views/AsteroidBeltPage.vue'),
      meta: { subtitle: 'Asteroid belt' },
    },
    {
      path: '/orrery/kuiper-belt',
      name: 'kuiper-belt',
      component: () => import('./views/KuiperBeltPage.vue'),
      meta: { subtitle: 'Kuiper belt' },
    },
    {
      path: '/orrery/earth',
      name: 'earth-system',
      component: PlanetSystemPage,
      props: { systemId: 'earth' },
      meta: { subtitle: 'Earth' },
    },
    {
      path: '/orrery/earth/time',
      name: 'earth-time',
      component: () => import('./views/EarthTimePage.vue'),
      meta: { subtitle: 'Earth · time' },
    },
    {
      path: '/orrery/earth/eclipse',
      name: 'earth-eclipse',
      component: () => import('./views/EarthEclipsePage.vue'),
      meta: { subtitle: 'Earth · eclipse' },
    },
    {
      path: '/orrery/earth/fields',
      name: 'earth-fields',
      component: () => import('./views/EarthFieldsPage.vue'),
      meta: { subtitle: 'Earth · fields' },
    },
    {
      path: '/orrery/earth/epicycles',
      name: 'earth-epicycles',
      component: () => import('./views/EarthEpicyclePage.vue'),
      meta: { subtitle: 'Earth · epicycles' },
    },
    {
      path: '/orrery/mars/time',
      name: 'mars-time',
      component: () => import('./views/MarsTimePage.vue'),
      meta: { subtitle: 'Mars · time' },
    },
    {
      path: '/orrery/jupiter',
      name: 'jupiter-system',
      component: PlanetSystemPage,
      props: { systemId: 'jupiter' },
      meta: { subtitle: 'Jupiter' },
    },
    {
      path: '/orrery/saturn',
      name: 'saturn-system',
      component: PlanetSystemPage,
      props: { systemId: 'saturn' },
      meta: { subtitle: 'Saturn' },
    },
    {
      path: '/orrery/uranus',
      name: 'uranus-system',
      component: PlanetSystemPage,
      props: { systemId: 'uranus' },
      meta: { subtitle: 'Uranus' },
    },
    {
      path: '/orrery/neptune',
      name: 'neptune-system',
      component: PlanetSystemPage,
      props: { systemId: 'neptune' },
      meta: { subtitle: 'Neptune' },
    },
    {
      path: '/constellations',
      name: 'constellations',
      component: ConstellationsPage,
      meta: { subtitle: 'Constellations', timeless: true, immersive: true },
    },
    {
      path: '/constellation/:id',
      name: 'constellation',
      component: ConstellationsPage,
      meta: { subtitle: 'Constellations', timeless: true, immersive: true },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
