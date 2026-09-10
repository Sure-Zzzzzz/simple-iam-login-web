import { createApp } from 'vue';
import '@sure-zzzzzz/simple-iam-theme-contract/theme.css';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import LoginView from './view/LoginView.vue';
import ConsentView from './view/ConsentView.vue';
import ChangePasswordView from './view/ChangePasswordView.vue';
import './style.css';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: to => ({ path: '/login', query: to.query }) },
    { path: '/login', component: LoginView },
    { path: '/consent', component: ConsentView },
    { path: '/change-password', component: ChangePasswordView }
  ]
});

createApp(App).use(router).mount('#app');
