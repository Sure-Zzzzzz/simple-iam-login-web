<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { DEFAULT_BRAND_NAME, fetchAuthorizeUrl, fetchBranding, fetchCaptcha, fetchLoginProviders, login, LoginError, type Branding, type CaptchaChallenge, type LoginProvider } from '../api/iamAuth';
import { initializeTheme } from '../theme';

const username = ref('');
const password = ref('');
const usernameInput = ref<HTMLInputElement | null>(null);
const showPassword = ref(false);
const loading = ref(false);
const redirecting = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const passwordProviders = ref<LoginProvider[]>([]);
const ssoProviders = ref<LoginProvider[]>([]);
const selectedProviderCode = ref('local-password');
const brandName = ref(DEFAULT_BRAND_NAME);
const captchaRequired = ref(false);
const captcha = ref<CaptchaChallenge | null>(null);
const captchaAnswer = ref('');
const captchaUnavailable = ref(false);
const captchaInput = ref<HTMLInputElement | null>(null);
const redirectTarget = new URLSearchParams(window.location.search).get('redirect');
const callbackError = new URLSearchParams(window.location.search).get('error');

const currentProvider = computed(() =>
  passwordProviders.value.find(provider => provider.code === selectedProviderCode.value) || null);
const providerSubtitle = computed(() => {
  if (passwordProviders.value.length > 1 && currentProvider.value) {
    return `请使用${currentProvider.value.name}。`;
  }
  return '请使用你的账号登录。';
});
const otherPasswordProviders = computed(() =>
  passwordProviders.value.filter(provider => provider.code !== selectedProviderCode.value));

const callbackErrorMessages: Record<string, string> = {
  'login-failed': '登录失败，请重试',
  'BIZ_002': '账号或密码错误',
  'BIZ_003': '登录服务暂不可用，请稍后重试',
  'BIZ_004': '登录未通过校验，请重试',
  'BIZ_005': '该账号需要管理员绑定后才能登录',
  'BIZ_006': '外部身份未提供可用的用户名，请联系管理员',
  'BIZ_007': '该登录方式不存在或已停用',
  'USER_005': '该账号已被禁用，请联系管理员'
};

const canSubmit = () =>
  username.value.trim().length > 0
  && password.value.length > 0
  && (!captchaRequired.value || captchaAnswer.value.trim().length > 0)
  && !loading.value
  && !redirecting.value;

function resetCaptcha() {
  captchaRequired.value = false;
  captcha.value = null;
  captchaAnswer.value = '';
  captchaUnavailable.value = false;
}

function selectProvider(code: string) {
  if (selectedProviderCode.value === code) {
    return;
  }
  selectedProviderCode.value = code;
  // 验证码阈值按登录方式维度独立计数，切换后旧要求不再适用
  resetCaptcha();
}

async function loadCaptcha() {
  captchaUnavailable.value = false;
  try {
    captcha.value = await fetchCaptcha();
    captchaAnswer.value = '';
  } catch {
    captcha.value = null;
    captchaUnavailable.value = true;
  }
}

onMounted(() => {
  initializeTheme();
  if (callbackError) {
    errorMessage.value = callbackErrorMessages[callbackError] || '登录失败，请重试';
  }
  loadBranding();
  loadProviders();
});

async function loadBranding() {
  try {
    const branding: Branding = await fetchBranding();
    brandName.value = branding.name || DEFAULT_BRAND_NAME;
    document.title = `${brandName.value} · 登录`;
  } catch {
    brandName.value = DEFAULT_BRAND_NAME;
  }
}

async function loadProviders() {
  try {
    const result = await fetchLoginProviders();
    passwordProviders.value = result.providers.filter(
      provider => provider.enabled && (provider.type === 'password' || provider.type === 'ldap')
    );
    ssoProviders.value = result.providers.filter(provider => provider.enabled && provider.type === 'sso');
    const defaultPasswordProvider = passwordProviders.value.find(
      provider => provider.code === result.defaultProvider
    ) || passwordProviders.value[0];
    if (defaultPasswordProvider) {
      selectedProviderCode.value = defaultPasswordProvider.code;
    }
  } catch {
    passwordProviders.value = [];
    ssoProviders.value = [];
  }
}

async function submitLogin() {
  if (!canSubmit()) {
    if (!username.value.trim() || !password.value.length) {
      errorMessage.value = '请输入账号和密码';
      if (!username.value.trim()) {
        usernameInput.value?.focus();
      }
    } else {
      errorMessage.value = '请输入验证码';
      captchaInput.value?.focus();
    }
    return;
  }
  loading.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    const loginArgs: Parameters<typeof login> = [username.value.trim(), password.value, selectedProviderCode.value];
    if (captchaRequired.value && captcha.value) {
      loginArgs.push(captcha.value.captchaId, captchaAnswer.value.trim());
    }
    const loginResult = await login(...loginArgs);
    resetCaptcha();
    if (loginResult.mustChangePassword === true) {
      successMessage.value = '首次登录或密码已被重置，请先修改密码';
      await new Promise(resolve => window.setTimeout(resolve, 600));
      const suffix = redirectTarget ? `?redirect=${encodeURIComponent(redirectTarget)}` : '';
      window.location.assign(`/change-password${suffix}`);
      return;
    }
    successMessage.value = '登录成功，正在进入统一应用门户';
    await new Promise(resolve => window.setTimeout(resolve, 600));
    window.location.assign(resolveRedirectTarget());
  } catch (error) {
    if (error instanceof LoginError && error.captchaRequired) {
      captchaRequired.value = true;
      errorMessage.value = error.message;
      await loadCaptcha();
    } else {
      errorMessage.value = error instanceof Error ? error.message : '登录失败';
    }
  } finally {
    loading.value = false;
  }
}

async function startExternalLogin(provider: LoginProvider) {
  if (redirecting.value) {
    return;
  }
  if (!provider.authorizeUrl) {
    errorMessage.value = `${provider.name} 暂未配置登录入口`;
    return;
  }
  redirecting.value = true;
  errorMessage.value = '';
  try {
    const authorizeUrl = await fetchAuthorizeUrl(provider.authorizeUrl, redirectTarget);
    window.location.assign(authorizeUrl);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '登录失败，请重试';
    redirecting.value = false;
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
        <h1>让身份访问<br>始终清晰可控</h1>
        <p>通过统一身份入口，安全访问统一应用门户中已获授权的应用。</p>
      </div>
      <ul class="login-trust-list" aria-label="平台能力说明">
        <li><span aria-hidden="true">01</span>统一身份认证</li>
        <li><span aria-hidden="true">02</span>细粒度访问控制</li>
        <li><span aria-hidden="true">03</span>应用访问审计</li>
      </ul>
      <p class="login-copyright">© 2026 统一身份与访问管理平台</p>
    </aside>

    <section class="login-content" aria-labelledby="login-title">
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

      <div
        class="login-card"
        :class="{ 'login-card--providers': ssoProviders.length > 0 || passwordProviders.length > 1 }"
      >
        <header class="login-card-header">
          <p class="login-kicker">统一认证中心</p>
          <h2 id="login-title">登录</h2>
          <p>{{ providerSubtitle }}</p>
        </header>

        <form class="login-form" @submit.prevent="submitLogin">
          <label>
            <span>账号</span>
            <input ref="usernameInput" v-model="username" type="text" autocomplete="username" placeholder="请输入账号">
          </label>
          <label>
            <span>密码</span>
            <div class="login-password-field">
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="current-password"
                placeholder="请输入密码"
              >
              <button
                type="button"
                class="login-password-toggle"
                :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                :aria-pressed="showPassword"
                @click="showPassword = !showPassword"
              >
                <svg v-if="showPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
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
          <div v-if="captchaRequired" class="login-captcha">
            <template v-if="captcha && captcha.type === 'image'">
              <label>
                <span class="login-captcha-field-head">
                  <span>验证码</span>
                  <button type="button" class="login-captcha-refresh" @click="loadCaptcha">看不清？换一张</button>
                </span>
                <span class="login-captcha-row">
                  <input
                    ref="captchaInput"
                    v-model="captchaAnswer"
                    type="text"
                    autocomplete="off"
                    placeholder="请输入图片中的字符"
                  >
                  <img
                    v-if="captcha.content"
                    :src="captcha.content"
                    alt="人机验证图片"
                    class="login-captcha-image"
                  >
                </span>
              </label>
            </template>
            <p v-else-if="captcha" class="login-captcha-unsupported">
              暂不支持该验证码类型（{{ captcha.type }}），请联系管理员
            </p>
            <div v-else-if="captchaUnavailable" class="login-captcha-unavailable">
              <span>验证码获取失败</span>
              <button type="button" class="login-captcha-refresh" @click="loadCaptcha">重新获取</button>
            </div>
          </div>
          <button type="submit" class="login-submit" :disabled="loading || redirecting">
            {{ loading ? '正在验证身份…' : '登录' }}
          </button>
        </form>

        <div v-if="otherPasswordProviders.length > 0" class="login-provider-switch">
          <button
            v-for="provider in otherPasswordProviders"
            :key="provider.code"
            type="button"
            class="login-provider-switch-link"
            @click="selectProvider(provider.code)"
          >
            使用 {{ provider.name }} →
          </button>
        </div>

        <section v-if="ssoProviders.length > 0" class="login-external-providers" aria-label="其他登录方式">
          <div class="login-divider"><span>其他登录方式</span></div>
          <button
            v-for="provider in ssoProviders"
            :key="provider.code"
            type="button"
            class="login-provider-button"
            :disabled="redirecting"
            @click="startExternalLogin(provider)"
          >
            {{ provider.name }}
          </button>
        </section>
      </div>
      <p class="login-copyright">© 2026 统一身份与访问管理平台</p>
    </section>
  </main>
</template>
