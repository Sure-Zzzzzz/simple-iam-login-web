<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { createPhoneChallenge, DEFAULT_BRAND_NAME, fetchAuthorizeUrl, fetchBranding, fetchCaptcha, fetchLoginProviders, login, LoginError, phoneLogin, resetPasswordByPhone, type Branding, type CaptchaChallenge, type LoginProvider } from '../api/iamAuth';
import { initializeTheme } from '../theme';

const username = ref('');
const password = ref('');
const phone = ref('');
const phoneCode = ref('');
const phoneChallengeId = ref('');
const phoneCodeCooldown = ref(0);
let phoneCooldownTimer: number | undefined;
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
const isPhoneMode = computed(() => currentProvider.value?.type === 'phone');

const formProviders = computed(() => passwordProviders.value);

// 短信能力声明的区号列表（出入口统一：list 直渲染，无单/多区号分支）；提交时组件内拼 E.164
const phoneRegions = computed(() => {
  const raw = passwordProviders.value.find(provider => provider.type === 'phone')?.supportedRegions;
  if (!raw) {
    return [];
  }
  return raw.split(',').map(region => region.trim()).filter(region => region.length > 0);
});
const phoneRegion = ref('');
watch(phoneRegions, regions => {
  if (regions.length > 0 && !regions.includes(phoneRegion.value)) {
    phoneRegion.value = regions[0];
  }
});
// 自绘 listbox(IAB webview 原生 select 弹层坐标不可靠,页面内渲染物理上不飞)
const regionMenuOpen = ref(false);
function closeRegionMenu() {
  regionMenuOpen.value = false;
}
function toggleRegionMenu() {
  regionMenuOpen.value = !regionMenuOpen.value;
}
function chooseRegion(region: string) {
  phoneRegion.value = region;
  regionMenuOpen.value = false;
}
const fullPhone = computed(() => phoneRegion.value + phone.value.trim());

const providerSubtitle = computed(() => {
  if (isPhoneMode.value) {
    return '请使用绑定的手机号获取验证码登录。';
  }
  if (passwordProviders.value.length > 1) {
    return '请选择登录方式，使用对应账号登录。';
  }
  return '请使用你的账号登录。';
});
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
  document.addEventListener('click', closeRegionMenu);
  if (callbackError) {
    errorMessage.value = callbackErrorMessages[callbackError] || '登录失败，请重试';
  }
  loadBranding();
  loadProviders();
});

onUnmounted(() => {
  document.removeEventListener('click', closeRegionMenu);
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
      provider => provider.enabled && (provider.type === 'password' || provider.type === 'ldap' || provider.type === 'phone')
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

async function sendPhoneCode() {
  if (!phone.value.trim()) {
    errorMessage.value = '请输入手机号';
    return;
  }
  if (phoneCodeCooldown.value > 0) return;
  try {
    const result = await createPhoneChallenge({ phone: fullPhone.value, purpose: 'login' });
    phoneChallengeId.value = result.challengeId;
    successMessage.value = '验证码已发送';
    errorMessage.value = '';
    phoneCodeCooldown.value = result.resendAfterSeconds ?? 60;
    phoneCooldownTimer = window.setInterval(() => {
      phoneCodeCooldown.value -= 1;
      if (phoneCodeCooldown.value <= 0 && phoneCooldownTimer) {
        window.clearInterval(phoneCooldownTimer);
      }
    }, 1000);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '验证码发送失败';
    successMessage.value = '';
  }
}

async function submitPhoneLogin() {
  if (!phone.value.trim() || !phoneCode.value.trim() || !phoneChallengeId.value) {
    errorMessage.value = '请输入手机号并完成验证码';
    return;
  }
  loading.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    const result = await phoneLogin(phoneChallengeId.value, phoneCode.value.trim(), fullPhone.value);
    successMessage.value = result.message || '登录成功';
    window.location.assign(redirectTarget || '/');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '验证码错误或已失效';
  } finally {
    loading.value = false;
  }
}

const forgotMode = ref(false);
const forgotChallengeId = ref('');
const forgotCode = ref('');
const forgotNewPassword = ref('');

async function sendForgotCode() {
  if (!phone.value.trim() || phoneCodeCooldown.value > 0) return;
  try {
    const result = await createPhoneChallenge({ phone: fullPhone.value, purpose: 'forgot-password' });
    forgotChallengeId.value = result.challengeId;
    successMessage.value = '验证码已发送';
    errorMessage.value = '';
    phoneCodeCooldown.value = result.resendAfterSeconds ?? 60;
    phoneCooldownTimer = window.setInterval(() => {
      phoneCodeCooldown.value -= 1;
      if (phoneCodeCooldown.value <= 0 && phoneCooldownTimer) window.clearInterval(phoneCooldownTimer);
    }, 1000);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '验证码发送失败';
    successMessage.value = '';
  }
}

async function submitForgot() {
  if (!phone.value.trim() || !forgotCode.value.trim() || !forgotNewPassword.value || !forgotChallengeId.value) {
    errorMessage.value = '请完整填写手机号、验证码与新密码';
    return;
  }
  loading.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    await resetPasswordByPhone(forgotChallengeId.value, forgotCode.value.trim(), fullPhone.value, forgotNewPassword.value);
    successMessage.value = '密码重置成功，全部会话已吊销，请用新密码登录';
    forgotMode.value = false;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '重置失败';
  } finally {
    loading.value = false;
  }
}

async function submitLogin() {
  if (isPhoneMode.value) {
    await submitPhoneLogin();
    return;
  }
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
          <h2 id="login-title">{{ forgotMode ? '重置密码' : '登录' }}</h2>
          <p>{{ forgotMode ? '通过手机号验证重置密码' : providerSubtitle }}</p>
        </header>

        <div v-if="!forgotMode && formProviders.length > 1" class="login-tabs" role="tablist" aria-label="登录方式">
          <button
            v-for="provider in formProviders"
            :key="provider.code"
            type="button"
            role="tab"
            :aria-selected="selectedProviderCode === provider.code"
            :class="['login-tab', { 'login-tab--active': selectedProviderCode === provider.code }]"
            @click="selectProvider(provider.code)"
          >
            {{ provider.name }}
          </button>
        </div>

        <form v-if="forgotMode" class="login-form" @submit.prevent="submitForgot">
          <label>
            <span>手机号</span>
            <span class="login-phone-row">
              <span v-if="phoneRegions.length > 0" class="login-phone-region">
                <button
                  type="button"
                  class="login-phone-region-toggle"
                  :aria-expanded="regionMenuOpen"
                  aria-haspopup="listbox"
                  aria-label="国家/地区区号"
                  @click.stop="toggleRegionMenu"
                  @keydown.esc="closeRegionMenu"
                >
                  {{ phoneRegion }}
                  <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
                </button>
                <ul v-if="regionMenuOpen" class="login-phone-region-menu" role="listbox" aria-label="区号列表">
                  <li
                    v-for="region in phoneRegions"
                    :key="region"
                    role="option"
                    :aria-selected="region === phoneRegion"
                    :class="['login-phone-region-option', { 'login-phone-region-option--active': region === phoneRegion }]"
                    @click.stop="chooseRegion(region)"
                  >{{ region }}</li>
                </ul>
              </span>
              <input v-model="phone" type="tel" autocomplete="tel-national" placeholder="请输入绑定的手机号">
            </span>
          </label>
          <label>
            <span>验证码</span>
            <span class="login-captcha-row">
              <input v-model="forgotCode" type="text" inputmode="numeric" maxlength="6" placeholder="短信验证码">
              <button type="button" class="login-code-send" :disabled="phoneCodeCooldown > 0" @click="sendForgotCode">
                {{ phoneCodeCooldown > 0 ? phoneCodeCooldown + 's' : '获取验证码' }}
              </button>
            </span>
          </label>
          <label>
            <span>新密码</span>
            <input v-model="forgotNewPassword" type="password" autocomplete="new-password" placeholder="请输入新密码">
          </label>
          <button type="submit" class="login-submit" :disabled="loading">
            {{ loading ? '正在重置…' : '重置密码' }}
          </button>
          <button type="button" class="login-provider-switch-link" @click="forgotMode = false">返回登录</button>
        </form>

        <form v-else class="login-form" @submit.prevent="submitLogin">
          <template v-if="isPhoneMode">
            <label>
              <span>手机号</span>
              <span class="login-phone-row">
                <span v-if="phoneRegions.length > 0" class="login-phone-region">
                  <button
                    type="button"
                    class="login-phone-region-toggle"
                    :aria-expanded="regionMenuOpen"
                    aria-haspopup="listbox"
                    aria-label="国家/地区区号"
                    @click.stop="toggleRegionMenu"
                    @keydown.esc="closeRegionMenu"
                  >
                    {{ phoneRegion }}
                    <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
                  </button>
                  <ul v-if="regionMenuOpen" class="login-phone-region-menu" role="listbox" aria-label="区号列表">
                    <li
                      v-for="region in phoneRegions"
                      :key="region"
                      role="option"
                      :aria-selected="region === phoneRegion"
                      :class="['login-phone-region-option', { 'login-phone-region-option--active': region === phoneRegion }]"
                      @click.stop="chooseRegion(region)"
                    >{{ region }}</li>
                  </ul>
                </span>
                <input v-model="phone" type="tel" autocomplete="tel-national" placeholder="请输入手机号">
              </span>
            </label>
            <label>
              <span>验证码</span>
              <span class="login-captcha-row">
                <input v-model="phoneCode" type="text" inputmode="numeric" maxlength="6" placeholder="短信验证码">
                <button type="button" class="login-code-send" :disabled="phoneCodeCooldown > 0" @click="sendPhoneCode">
                  {{ phoneCodeCooldown > 0 ? phoneCodeCooldown + 's' : '获取验证码' }}
                </button>
              </span>
            </label>
          </template>
          <template v-else>
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
            <div v-if="currentProvider?.type === 'password' && phoneRegions.length > 0" class="login-forgot-row">
              <button type="button" class="login-provider-switch-link" @click="forgotMode = true; errorMessage = ''; successMessage = ''">忘记密码？</button>
            </div>
          </template>
          <div v-if="captchaRequired && !isPhoneMode" class="login-captcha">
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
