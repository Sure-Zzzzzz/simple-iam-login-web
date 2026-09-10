<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { changePassword, DEFAULT_BRAND_NAME, fetchBranding, type Branding } from '../api/iamAuth';
import { initializeTheme } from '../theme';

const oldPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const showOldPassword = ref(false);
const showNewPassword = ref(false);
const showConfirmPassword = ref(false);
const loading = ref(false);
const redirecting = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const brandName = ref(DEFAULT_BRAND_NAME);
const redirectTarget = new URLSearchParams(window.location.search).get('redirect');

onMounted(() => {
  initializeTheme();
  loadBranding();
});

async function loadBranding() {
  try {
    const branding: Branding = await fetchBranding();
    brandName.value = branding.name || DEFAULT_BRAND_NAME;
    document.title = `${brandName.value} · 修改密码`;
  } catch {
    brandName.value = DEFAULT_BRAND_NAME;
  }
}

function compareNewPasswords() {
  if (!newPassword.value.length || !confirmPassword.value.length) {
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    errorMessage.value = '两次输入的新密码不一致';
  } else if (errorMessage.value === '两次输入的新密码不一致') {
    errorMessage.value = '';
  }
}

async function submitChange() {
  if (redirecting.value) {
    return;
  }
  if (!oldPassword.value.length || !newPassword.value.length || !confirmPassword.value.length) {
    errorMessage.value = '请填写原密码、新密码和确认新密码';
    return;
  }
  // 失焦已即时比对；此处兜底防程序化填充/自动填充未经 blur 的提交路径
  if (newPassword.value !== confirmPassword.value) {
    errorMessage.value = '两次输入的新密码不一致';
    return;
  }
  loading.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    await changePassword(oldPassword.value, newPassword.value);
    successMessage.value = '密码修改成功，正在进入统一应用门户';
    redirecting.value = true;
    await new Promise(resolve => window.setTimeout(resolve, 600));
    window.location.assign(resolveRedirectTarget());
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '修改密码失败，请稍后重试';
  } finally {
    loading.value = false;
  }
}

function resolveRedirectTarget() {
  if (redirectTarget && redirectTarget.startsWith('/') && !redirectTarget.startsWith('//')) {
    return redirectTarget;
  }
  return '/app/';
}
</script>

<template>
  <main class="login-shell">
    <aside class="login-brand-panel" aria-label="平台说明">
      <span class="login-brand-glow login-brand-glow--lower" aria-hidden="true"></span>
      <span class="login-brand-glow login-brand-glow--upper" aria-hidden="true"></span>
      <div class="login-brand-copy">
        <span class="login-eyebrow">统一身份与访问管理</span>
        <h1>定期更新密码<br>守住账号安全</h1>
        <p>修改完成后，其他已登录终端将自动退出，请使用新密码重新登录。</p>
      </div>
      <ul class="login-trust-list" aria-label="平台能力说明">
        <li><span aria-hidden="true">01</span>统一身份认证</li>
        <li><span aria-hidden="true">02</span>细粒度访问控制</li>
        <li><span aria-hidden="true">03</span>应用访问审计</li>
      </ul>
      <p class="login-copyright">© 2026 统一身份与访问管理平台</p>
    </aside>

    <section class="login-content" aria-labelledby="change-password-title">
      <div
        v-if="errorMessage || successMessage"
        class="login-notification-area"
        aria-live="polite"
      >
        <p v-if="errorMessage" class="login-notification login-notification--error" role="alert">
          {{ errorMessage }}
        </p>
        <p v-else class="login-notification login-notification--success" role="status">
          {{ successMessage }}
        </p>
      </div>

      <div class="login-card">
        <header class="login-card-header">
          <p class="login-kicker">统一认证中心</p>
          <h2 id="change-password-title">修改密码</h2>
          <p>首次登录或密码被重置后，须先设置新密码才能继续使用。</p>
        </header>

        <form class="login-form" @submit.prevent="submitChange">
          <label>
            <span>原密码</span>
            <div class="login-password-field">
              <input
                v-model="oldPassword"
                :type="showOldPassword ? 'text' : 'password'"
                autocomplete="current-password"
                placeholder="请输入原密码"
              >
              <button
                type="button"
                class="login-password-toggle"
                :aria-label="showOldPassword ? '隐藏原密码' : '显示原密码'"
                :aria-pressed="showOldPassword"
                @click="showOldPassword = !showOldPassword"
              >
                <svg v-if="showOldPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>
          </label>
          <label>
            <span>新密码</span>
            <div class="login-password-field">
              <input
                v-model="newPassword"
                :type="showNewPassword ? 'text' : 'password'"
                autocomplete="new-password"
                placeholder="请输入新密码"
                @blur="compareNewPasswords"
              >
              <button
                type="button"
                class="login-password-toggle"
                :aria-label="showNewPassword ? '隐藏新密码' : '显示新密码'"
                :aria-pressed="showNewPassword"
                @click="showNewPassword = !showNewPassword"
              >
                <svg v-if="showNewPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>
          </label>
          <label>
            <span>确认新密码</span>
            <div class="login-password-field">
              <input
                v-model="confirmPassword"
                :type="showConfirmPassword ? 'text' : 'password'"
                autocomplete="new-password"
                placeholder="请再次输入新密码"
                @blur="compareNewPasswords"
              >
              <button
                type="button"
                class="login-password-toggle"
                :aria-label="showConfirmPassword ? '隐藏确认新密码' : '显示确认新密码'"
                :aria-pressed="showConfirmPassword"
                @click="showConfirmPassword = !showConfirmPassword"
              >
                <svg v-if="showConfirmPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>
          </label>
          <button type="submit" class="login-submit" :disabled="loading || redirecting">
            {{ loading ? '正在提交…' : '确认修改' }}
          </button>
        </form>

        <div class="login-provider-switch">
          <button type="button" class="login-provider-switch-link" @click="$router.push('/login')">
            返回登录
          </button>
        </div>
      </div>
      <p class="login-copyright">© 2026 统一身份与访问管理平台</p>
    </section>
  </main>
</template>
