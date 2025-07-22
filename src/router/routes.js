const routes = [
  // Login route (no layout)
  {
    path: '/login',
    name: 'login',
    component: () => import('pages/LoginPage.vue')
  },

  // Main app routes (with layout and auth guard)
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    meta: { requiresAuth: false }, // Set to true when auth is fully implemented
    children: [
      { 
        path: '', 
        name: 'task-manager',
        component: () => import('pages/TaskManagerPage.vue') 
      },
      { 
        path: 'demo', 
        name: 'demo',
        component: () => import('pages/IndexPage.vue') 
      }
    ]
  },

  // Always leave this as last one,
  // but you can also remove it
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue')
  }
]

export default routes
