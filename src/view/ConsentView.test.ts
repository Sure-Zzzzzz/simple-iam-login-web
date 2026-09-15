import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ConsentView from './ConsentView.vue';
import * as iamAuth from '../api/iamAuth';

describe('ConsentView', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/consent?state=consent-state-1');
    vi.spyOn(iamAuth, 'fetchBranding').mockResolvedValue({
      name: '统一认证中心',
      logoUrl: null,
      customCssUrl: null,
      customJsUrl: null
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, '', '/');
  });

  it('复用登录页布局并展示可信应用名称和图标，而非平台品牌图标', async () => {
    vi.spyOn(iamAuth, 'fetchConsentInfo').mockResolvedValue({
      registeredClientId: 'registered-client-1',
      clientId: 'credential-console-pkce',
      clientName: '访问凭证管理端',
      applicationName: '访问凭证管理',
      applicationIcon: 'key',
      state: 'consent-state-1',
      requestedScopes: ['openid', 'profile'],
      previouslyApprovedScopes: []
    });

    const wrapper = mount(ConsentView);
    await flushPromises();

    expect(wrapper.classes()).toContain('login-shell');
    expect(wrapper.find('.auth-brand-lockup').exists()).toBe(false);
    expect(wrapper.get('.login-brand-panel').text()).toContain('请求范围清晰可见');
    expect(wrapper.get('.consent-application').text()).toContain('访问凭证管理');
    expect(wrapper.get('.consent-application').text()).toContain('访问凭证管理端');
    expect(wrapper.find('.consent-application .lucide-key-round').exists()).toBe(true);
    expect(wrapper.get('input[type="hidden"][name="client_id"]').attributes('value')).toBe('credential-console-pkce');
    expect(wrapper.get('button[type="submit"]').text()).toBe('同意并继续');
  });

  it('未知应用图标应回退为默认应用图标，避免授权页渲染失败', async () => {
    vi.spyOn(iamAuth, 'fetchConsentInfo').mockResolvedValue({
      registeredClientId: 'registered-client-2',
      clientId: 'legacy-client',
      clientName: '历史客户端',
      applicationName: '历史客户端',
      applicationIcon: 'future-icon',
      state: 'consent-state-1',
      requestedScopes: ['openid'],
      previouslyApprovedScopes: []
    });

    const wrapper = mount(ConsentView);
    await flushPromises();

    expect(wrapper.find('.consent-application .lucide-layout-grid').exists()).toBe(true);
    expect(wrapper.findAll('input[type="hidden"][name="scope"]')).toHaveLength(1);
  });
});
