const routes = [
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
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
