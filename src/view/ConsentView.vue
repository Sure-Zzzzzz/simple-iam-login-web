<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import defaultLogoUrl from '../assets/sure-zzzzzz-logo.svg';
import { DEFAULT_BRAND_NAME, fetchBranding, fetchConsentInfo, type ConsentInfo } from '../api/iamAuth';
import { initializeTheme } from '../theme';

const params = new URLSearchParams(window.location.search);
const state = params.get('state') ?? '';

const loading = ref(true);
const errorMessage = ref('');
const consentInfo = ref<ConsentInfo | null>(null);
const approvedScopes = ref<Set<string>>(new Set());
const brandName = ref(DEFAULT_BRAND_NAME);
const brandLogoUrl = ref(defaultLogoUrl);

const SCOPE_LABELS: Record<string, string> = {
  openid: 'OpenID 身份标识',
  profile: '基本资料（显示名、用户名）',
  email: '邮箱地址',
  phone: '手机号码'
};

const requiredScopes = computed(() => consentInfo.value?.requestedScopes.filter(scope => scope === 'openid') || []);
const optionalScopes = computed(() => consentInfo.value?.requestedScopes.filter(scope => scope !== 'openid') || []);

function scopeLabel(scope: string): string {
  return SCOPE_LABELS[scope] ?? scope;
}

onMounted(async () => {
  initializeTheme();
  try {
    const branding = await fetchBranding();
    brandName.value = branding.name || DEFAULT_BRAND_NAME;
    brandLogoUrl.value = branding.logoUrl || defaultLogoUrl;
  } catch {
    // 品牌加载失败不阻断流程
  }
  if (!state) {
    errorMessage.value = '授权请求无效，请重新发起';
    loading.value = false;
    return;
  }
  try {
    const info = await fetchConsentInfo(state);
    consentInfo.value = info;
    document.title = `授权确认 · ${brandName.value}`;
    approvedScopes.value = new Set(info.requestedScopes);
  } catch {
    errorMessage.value = '授权信息加载失败，请重新发起授权';
  } finally {
    loading.value = false;
  }
});

function toggleScope(scope: string) {
  if (approvedScopes.value.has(scope)) {
    approvedScopes.value.delete(scope);
  } else {
    approvedScopes.value.add(scope);
  }
}
</script>

<template>
  <main class="auth-shell">
    <aside class="auth-brand-panel consent-brand-panel" aria-label="授权说明">
      <div class="auth-brand-lockup">
        <img :src="brandLogoUrl" :alt="brandName">
        <span>{{ brandName }}</span>
      </div>
      <div class="auth-brand-copy">
        <span class="auth-eyebrow">SECURE AUTHORIZATION</span>
        <h1>确认应用访问<br>你的身份信息</h1>
        <p>你可以查看应用请求的每项权限，并仅授予你同意共享的信息。</p>
      </div>
    </aside>

    <section class="auth-content" aria-labelledby="consent-title">
      <div class="auth-card consent-card">
        <header class="auth-card-header">
          <p class="auth-kicker">统一认证中心</p>
          <h2 id="consent-title">授权确认</h2>
          <p>请确认本次应用访问范围。</p>
        </header>

        <div v-if="loading" class="form-message info" role="status">正在校验授权请求…</div>
        <div v-else-if="errorMessage" class="form-message error" role="alert">{{ errorMessage }}</div>

        <template v-else-if="consentInfo">
          <section class="consent-application" aria-label="请求授权的应用">
            <span>正在请求授权</span>
            <strong>{{ consentInfo.clientName || consentInfo.clientId }}</strong>
          </section>

          <form action="/oauth2/authorize" method="POST" class="consent-form">
            <input type="hidden" name="client_id" :value="consentInfo.clientId">
            <input type="hidden" name="state" :value="consentInfo.state">

            <section v-if="requiredScopes.length" class="scope-section">
              <div class="scope-section-heading">
                <div><h3>必要权限</h3><p>应用完成身份识别所必需。</p></div>
                <span class="scope-required">必需</span>
              </div>
              <ul class="scope-list">
                <li v-for="scope in requiredScopes" :key="scope" class="scope-item required">
                  <input type="hidden" name="scope" :value="scope">
                  <span class="scope-check" aria-hidden="true">✓</span>
                  <span class="scope-label">{{ scopeLabel(scope) }}</span>
                </li>
              </ul>
            </section>

            <section v-if="optionalScopes.length" class="scope-section">
              <div class="scope-section-heading"><div><h3>可选权限</h3><p>你可以按需取消勾选。</p></div></div>
              <ul class="scope-list">
                <li v-for="scope in optionalScopes" :key="scope" class="scope-item">
                  <label>
                    <input
                      type="checkbox"
                      name="scope"
                      :value="scope"
                      :checked="approvedScopes.has(scope)"
                      @change="toggleScope(scope)"
                    >
                    <span class="scope-label">{{ scopeLabel(scope) }}</span>
                    <span v-if="consentInfo.previouslyApprovedScopes.includes(scope)" class="scope-badge">此前已授权</span>
                  </label>
                </li>
              </ul>
            </section>

            <footer class="consent-actions">
              <button type="submit" class="btn-primary">同意并继续</button>
            </footer>
          </form>

          <form action="/oauth2/authorize" method="POST" class="consent-decline-form">
            <input type="hidden" name="client_id" :value="consentInfo.clientId">
            <input type="hidden" name="state" :value="consentInfo.state">
            <button type="submit" class="btn-secondary">拒绝授权</button>
          </form>
        </template>
      </div>
    </section>
  </main>
</template>
