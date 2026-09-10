import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginView from './LoginView.vue';
import * as iamAuth from '../api/iamAuth';
import { LoginError } from '../api/iamAuth';

const onlyPasswordProviders = {
  defaultProvider: 'local-password',
  providers: [
    {
      code: 'local-password',
      name: '账号密码登录',
      type: 'password',
      enabled: true,
      authorizeUrl: null,
      description: '使用账号和密码登录'
    },
    {
      code: 'ldap-password',
      name: '企业账号登录',
      type: 'ldap',
      enabled: false,
      authorizeUrl: null,
      description: '预留 LDAP bind 凭证校验入口，1.0.0 默认关闭'
    },
    {
      code: 'enterprise-sso',
      name: '企业 SSO 登录',
      type: 'sso',
      enabled: false,
      authorizeUrl: null,
      description: '预留 OIDC / SAML / CAS 单点登录入口，1.0.0 默认关闭'
    }
  ]
};

describe('LoginView', () => {
  beforeEach(() => {
    vi.spyOn(iamAuth, 'fetchBranding').mockResolvedValue({
      name: '统一认证中心',
      logoUrl: null,
      customCssUrl: null,
      customJsUrl: null
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('默认只展示账号密码表单，不暴露未启用的 LDAP/SSO 占位与内部实现细节', async () => {
    vi.spyOn(iamAuth, 'fetchLoginProviders').mockResolvedValue(onlyPasswordProviders);

    const wrapper = mount(LoginView);
    await flushPromises();

    expect(wrapper.find('.auth-card-mark').exists()).toBe(false);
    expect(wrapper.find('.auth-brand-lockup').exists()).toBe(false);
    expect(wrapper.classes()).toContain('login-shell');
    expect(wrapper.get('.login-brand-panel').text()).toContain('统一身份与访问管理');
    expect(wrapper.get('.login-brand-panel').text()).toContain('通过统一身份入口，安全访问统一应用门户中已获授权的应用。');
    expect(wrapper.get('.login-trust-list').text()).toContain('01统一身份认证');
    expect(wrapper.get('.login-trust-list').text()).toContain('02细粒度访问控制');
    expect(wrapper.get('.login-trust-list').text()).toContain('03应用访问审计');
    expect(wrapper.get('.login-card-header').text()).toContain('统一认证中心');
    expect(wrapper.get('.login-card-header').text()).toContain('登录');
    expect(wrapper.get('.login-card-header').text()).toContain('请使用你的账号登录。');
    expect(wrapper.get('input[type="text"]').attributes('autocomplete')).toBe('username');
    expect(wrapper.get('input[type="text"]').attributes('placeholder')).toBe('请输入账号');
    expect(wrapper.get('input[type="password"]').attributes('autocomplete')).toBe('current-password');
    expect(wrapper.get('button[type="submit"]').text()).toBe('登录');
    expect(wrapper.text()).not.toContain('登录并继续');
    expect(wrapper.text()).not.toContain('登录即表示你将遵守所在组织的访问控制与安全策略。');
    expect(wrapper.find('.auth-footnote').exists()).toBe(false);
    expect(wrapper.findAll('.login-copyright')).toHaveLength(2);
    expect(wrapper.findAll('.login-copyright').map(element => element.text())).toEqual([
      '© 2026 统一身份与访问管理平台',
      '© 2026 统一身份与访问管理平台'
    ]);
    expect(wrapper.text()).not.toContain('Sure-Zzzzzz');
    expect(wrapper.text()).not.toContain('SURE统一认证平台');
    expect(wrapper.text()).not.toContain('本地 MySQL');
    expect(wrapper.text()).not.toContain('企业账号登录');
    expect(wrapper.text()).not.toContain('企业 SSO 登录');
    expect(wrapper.text()).not.toContain('已预留扩展登录方式');
    expect(wrapper.text()).not.toContain('其他登录方式');
    expect(wrapper.findAll('.login-external-providers button')).toHaveLength(0);
  });

  it('启用的第三方登录入口应出现在其他登录方式区', async () => {
    vi.spyOn(iamAuth, 'fetchLoginProviders').mockResolvedValue({
      defaultProvider: 'local-password',
      providers: [
        onlyPasswordProviders.providers[0],
        {
          code: 'enterprise-sso',
          name: '企业 SSO 登录',
          type: 'sso',
          enabled: true,
          authorizeUrl: 'https://sso.example.com/authorize',
          description: null
        }
      ]
    });

    const wrapper = mount(LoginView);
    await flushPromises();

    expect(wrapper.classes()).toContain('login-shell');
    expect(wrapper.get('.login-card').classes()).toContain('login-card--providers');
    expect(wrapper.text()).toContain('其他登录方式');
    expect(wrapper.text()).toContain('企业 SSO 登录');
  });

  it('启用的 LDAP 登录方式应以底部切换链接呈现并在提交时携带 provider', async () => {
    vi.spyOn(iamAuth, 'fetchLoginProviders').mockResolvedValue({
      defaultProvider: 'local-password',
      providers: [
        onlyPasswordProviders.providers[0],
        {
          code: 'ldap-password',
          name: 'LDAP 登录',
          type: 'ldap',
          enabled: true,
          authorizeUrl: null,
          description: null
        }
      ]
    });
    const loginSpy = vi.spyOn(iamAuth, 'login').mockResolvedValue({
      message: '登录成功',
      user: {
        userId: 2,
        username: 'ops-user',
        displayName: 'ops-user',
        admin: false,
        authorities: []
      }
    });
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { assign },
      writable: true
    });

    const wrapper = mount(LoginView);
    await flushPromises();

    expect(wrapper.text()).toContain('请使用账号密码登录。');
    const switchLinks = wrapper.findAll('.login-provider-switch-link');
    expect(switchLinks).toHaveLength(1);
    expect(switchLinks[0].text()).toContain('LDAP 登录');

    await switchLinks[0].trigger('click');
    expect(wrapper.text()).toContain('请使用LDAP 登录。');
    const switchBackLink = wrapper.findAll('.login-provider-switch-link');
    expect(switchBackLink).toHaveLength(1);
    expect(switchBackLink[0].text()).toContain('账号密码登录');

    await wrapper.get('input[type="text"]').setValue('ops-user');
    await wrapper.get('input[type="password"]').setValue('Ldap@1234');
    await wrapper.get('form').trigger('submit.prevent');

    expect(loginSpy).toHaveBeenCalledWith('ops-user', 'Ldap@1234', 'ldap-password');
  });

  it('密码框应支持眼睛按钮在明文与密文间切换', async () => {
    vi.spyOn(iamAuth, 'fetchLoginProviders').mockResolvedValue(onlyPasswordProviders);

    const wrapper = mount(LoginView);
    await flushPromises();

    const passwordInput = wrapper.get('input[autocomplete="current-password"]');
    expect(passwordInput.attributes('type')).toBe('password');

    const toggle = wrapper.get('.login-password-toggle');
    expect(toggle.attributes('aria-label')).toBe('显示密码');
    expect(toggle.attributes('aria-pressed')).toBe('false');

    await toggle.trigger('click');
    expect(passwordInput.attributes('type')).toBe('text');
    expect(toggle.attributes('aria-label')).toBe('隐藏密码');
    expect(toggle.attributes('aria-pressed')).toBe('true');

    await toggle.trigger('click');
    expect(passwordInput.attributes('type')).toBe('password');
    expect(toggle.attributes('aria-pressed')).toBe('false');
  });

  it('账号和密码为空时保持登录按钮可点击，并在提交后提示必填项', async () => {
    vi.spyOn(iamAuth, 'fetchLoginProviders').mockResolvedValue(onlyPasswordProviders);

    const wrapper = mount(LoginView);
    await flushPromises();
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined();

    await wrapper.get('form').trigger('submit.prevent');

    expect(wrapper.get('[role="alert"]').text()).toBe('请输入账号和密码');
    expect(wrapper.get('[role="alert"]').element.closest('.login-card')).toBeNull();
    expect(wrapper.get('[role="alert"]').element.closest('.login-form')).toBeNull();
  });

  it('提交有效账号密码后在请求完成前显示验证状态', async () => {
    vi.spyOn(iamAuth, 'fetchLoginProviders').mockResolvedValue(onlyPasswordProviders);
    let resolveLogin: (value: iamAuth.LoginResponse) => void;
    const loginPromise = new Promise<iamAuth.LoginResponse>(resolve => {
      resolveLogin = resolve;
    });
    vi.spyOn(iamAuth, 'login').mockReturnValue(loginPromise);
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { assign },
      writable: true
    });

    const wrapper = mount(LoginView);
    await flushPromises();
    await wrapper.get('input[type="text"]').setValue('admin');
    await wrapper.get('input[type="password"]').setValue('password');
    await wrapper.get('form').trigger('submit.prevent');

    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('button[type="submit"]').text()).toBe('正在验证身份…');

    vi.useFakeTimers();
    resolveLogin!({
      message: '登录成功',
      user: {
        userId: 1,
        username: 'admin',
        displayName: 'admin',
        admin: true,
        authorities: ['ROLE_iam_admin']
      }
    });
    await flushPromises();

    expect(assign).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(assign).toHaveBeenCalledWith('/app/');
  });

  it('输入账号密码后调用登录 API，并在管理员登录成功后进入默认 IAM 应用', async () => {
    vi.spyOn(iamAuth, 'fetchLoginProviders').mockResolvedValue(onlyPasswordProviders);
    const loginSpy = vi.spyOn(iamAuth, 'login').mockResolvedValue({
      message: '登录成功',
      user: {
        userId: 1,
        username: 'admin',
        displayName: 'admin',
        admin: true,
        authorities: ['ROLE_iam_admin']
      }
    });
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { assign },
      writable: true
    });

    const wrapper = mount(LoginView);
    await flushPromises();
    vi.useFakeTimers();
    await wrapper.get('input[type="text"]').setValue('admin');
    await wrapper.get('input[type="password"]').setValue('Admin@1234');
    await wrapper.get('form').trigger('submit.prevent');
    await flushPromises();

    expect(loginSpy).toHaveBeenCalledWith('admin', 'Admin@1234', 'local-password');
    expect(wrapper.get('[role="status"]').text()).toBe('登录成功，正在进入统一应用门户');
    expect(wrapper.get('[role="status"]').element.closest('.login-card')).toBeNull();
    expect(assign).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(assign).toHaveBeenCalledWith('/app/');
  });

  it('普通用户登录成功后进入默认 IAM 应用', async () => {
    vi.spyOn(iamAuth, 'fetchLoginProviders').mockResolvedValue(onlyPasswordProviders);
    vi.spyOn(iamAuth, 'login').mockResolvedValue({
      message: '登录成功',
      user: {
        userId: 2,
        username: 'user',
        displayName: 'user',
        admin: false,
        authorities: ['ROLE_iam_user']
      }
    });
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { assign },
      writable: true
    });

    const wrapper = mount(LoginView);
    await flushPromises();
    vi.useFakeTimers();
    await wrapper.get('input[type="text"]').setValue('user');
    await wrapper.get('input[type="password"]').setValue('User@1234');
    await wrapper.get('form').trigger('submit.prevent');
    await flushPromises();

    expect(wrapper.text()).toContain('登录成功，正在进入统一应用门户');
    expect(assign).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(assign).toHaveBeenCalledWith('/app/');
  });

  it('登录响应要求强制改密时应提示并跳转改密页', async () => {
    vi.spyOn(iamAuth, 'fetchLoginProviders').mockResolvedValue(onlyPasswordProviders);
    vi.spyOn(iamAuth, 'login').mockResolvedValue({
      message: '登录成功',
      mustChangePassword: true,
      user: {
        userId: 2,
        username: 'user',
        displayName: 'user',
        admin: false,
        authorities: ['ROLE_iam_user']
      }
    });
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { assign },
      writable: true
    });

    const wrapper = mount(LoginView);
    await flushPromises();
    vi.useFakeTimers();
    await wrapper.get('input[type="text"]').setValue('user');
    await wrapper.get('input[type="password"]').setValue('Admin@1234');
    await wrapper.get('form').trigger('submit.prevent');
    await flushPromises();

    expect(wrapper.get('[role="status"]').text()).toBe('首次登录或密码已被重置，请先修改密码');
    expect(assign).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(assign).toHaveBeenCalledWith('/change-password');
  });

  it('强制改密跳转应携带原始 redirect 目标，改密完成后回到原入口', async () => {
    vi.spyOn(iamAuth, 'fetchLoginProviders').mockResolvedValue(onlyPasswordProviders);
    vi.spyOn(iamAuth, 'login').mockResolvedValue({
      message: '登录成功',
      mustChangePassword: true,
      user: {
        userId: 2,
        username: 'user',
        displayName: 'user',
        admin: false,
        authorities: ['ROLE_iam_user']
      }
    });
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { assign, search: '?redirect=%2Foauth2%2Fauthorize%3Fclient_id%3Ddemo' },
      writable: true
    });

    const wrapper = mount(LoginView);
    await flushPromises();
    vi.useFakeTimers();
    await wrapper.get('input[type="text"]').setValue('user');
    await wrapper.get('input[type="password"]').setValue('Admin@1234');
    await wrapper.get('form').trigger('submit.prevent');
    await flushPromises();

    expect(assign).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(assign).toHaveBeenCalledWith(
      `/change-password?redirect=${encodeURIComponent('/oauth2/authorize?client_id=demo')}`
    );
  });

  it('登录失败时展示错误消息且不跳转', async () => {
    vi.spyOn(iamAuth, 'fetchLoginProviders').mockResolvedValue(onlyPasswordProviders);
    vi.spyOn(iamAuth, 'login').mockRejectedValue(new Error('账号或密码错误'));
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { assign },
      writable: true
    });

    const wrapper = mount(LoginView);
    await flushPromises();
    await wrapper.get('input[type="text"]').setValue('admin');
    await wrapper.get('input[type="password"]').setValue('Wrong@0000');
    await wrapper.get('form').trigger('submit.prevent');

    expect(wrapper.get('[role="alert"]').text()).toBe('账号或密码错误');
    expect(wrapper.get('.login-card').classes()).not.toContain('login-card--error');
    expect(wrapper.get('[role="alert"]').element.closest('.login-card')).toBeNull();
    expect(wrapper.get('[role="alert"]').element.closest('.login-form')).toBeNull();
    expect(wrapper.get('.login-brand-panel').text()).toContain('01统一身份认证');
    expect(wrapper.get('.login-brand-panel').text()).toContain('02细粒度访问控制');
    expect(wrapper.get('.login-brand-panel').text()).toContain('03应用访问审计');
    expect(assign).not.toHaveBeenCalled();
  });

  it('存在 redirect 参数时管理员登录成功应优先回跳原目标', async () => {
    vi.spyOn(iamAuth, 'fetchLoginProviders').mockResolvedValue(onlyPasswordProviders);
    vi.spyOn(iamAuth, 'login').mockResolvedValue({
      message: '登录成功',
      user: {
        userId: 1,
        username: 'admin',
        displayName: 'admin',
        admin: true,
        authorities: ['ROLE_iam_admin']
      }
    });
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { assign, search: '?redirect=%2Fapp%2Fiam%2Fusers' },
      writable: true
    });

    const wrapper = mount(LoginView);
    await flushPromises();
    vi.useFakeTimers();
    await wrapper.get('input[type="text"]').setValue('admin');
    await wrapper.get('input[type="password"]').setValue('Admin@1234');
    await wrapper.get('form').trigger('submit.prevent');
    await flushPromises();

    expect(assign).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(assign).toHaveBeenCalledWith('/app/iam/users');
  });

  it('登录被要求人机验证时应动态展示验证码区块并自动取题', async () => {
    vi.spyOn(iamAuth, 'fetchLoginProviders').mockResolvedValue(onlyPasswordProviders);
    vi.spyOn(iamAuth, 'login').mockRejectedValueOnce(
      new LoginError('请完成人机验证后重试', true)
    );
    const captchaSpy = vi.spyOn(iamAuth, 'fetchCaptcha').mockResolvedValue({
      captchaId: 'c-id-1',
      type: 'image',
      content: 'data:image/png;base64,AAAA'
    });

    const wrapper = mount(LoginView);
    await flushPromises();
    expect(wrapper.find('.login-captcha').exists()).toBe(false);

    await wrapper.get('input[type="text"]').setValue('admin');
    await wrapper.get('input[type="password"]').setValue('Wrong@0000');
    await wrapper.get('form').trigger('submit.prevent');
    await flushPromises();

    expect(captchaSpy).toHaveBeenCalledTimes(1);
    expect(wrapper.find('.login-captcha').exists()).toBe(true);
    expect(wrapper.get('[role="alert"]').text()).toBe('请完成人机验证后重试');
    const image = wrapper.get('.login-captcha-image');
    expect(image.attributes('src')).toBe('data:image/png;base64,AAAA');
    expect(image.attributes('alt')).toBe('人机验证图片');
    expect(wrapper.get('.login-captcha-refresh').text()).toBe('看不清？换一张');
  });

  it('验证码为空时提交应提示输入验证码且不调用登录 API', async () => {
    vi.spyOn(iamAuth, 'fetchLoginProviders').mockResolvedValue(onlyPasswordProviders);
    const loginSpy = vi.spyOn(iamAuth, 'login').mockRejectedValueOnce(
      new LoginError('请完成人机验证后重试', true)
    );
    vi.spyOn(iamAuth, 'fetchCaptcha').mockResolvedValue({
      captchaId: 'c-id-1',
      type: 'image',
      content: 'data:image/png;base64,AAAA'
    });

    const wrapper = mount(LoginView);
    await flushPromises();
    await wrapper.get('input[type="text"]').setValue('admin');
    await wrapper.get('input[type="password"]').setValue('Admin@1234');
    await wrapper.get('form').trigger('submit.prevent');
    await flushPromises();

    await wrapper.get('form').trigger('submit.prevent');
    await flushPromises();

    expect(loginSpy).toHaveBeenCalledTimes(1);
    expect(wrapper.get('[role="alert"]').text()).toBe('请输入验证码');
  });

  it('展示验证码后再次提交应携带 captchaId 与 captchaAnswer', async () => {
    vi.spyOn(iamAuth, 'fetchLoginProviders').mockResolvedValue(onlyPasswordProviders);
    const loginSpy = vi.spyOn(iamAuth, 'login')
      .mockRejectedValueOnce(new LoginError('请完成人机验证后重试', true))
      .mockResolvedValueOnce({
        message: '登录成功',
        user: {
          userId: 1,
          username: 'admin',
          displayName: 'admin',
          admin: true,
          authorities: ['ROLE_iam_admin']
        }
      });
    vi.spyOn(iamAuth, 'fetchCaptcha').mockResolvedValue({
      captchaId: 'c-id-1',
      type: 'image',
      content: 'data:image/png;base64,AAAA'
    });
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { value: { assign }, writable: true });

    const wrapper = mount(LoginView);
    await flushPromises();
    vi.useFakeTimers();
    await wrapper.get('input[type="text"]').setValue('admin');
    await wrapper.get('input[type="password"]').setValue('Admin@1234');
    await wrapper.get('form').trigger('submit.prevent');
    await flushPromises();

    await wrapper.get('.login-captcha input').setValue('ab3d');
    await wrapper.get('form').trigger('submit.prevent');
    await flushPromises();

    expect(loginSpy).toHaveBeenLastCalledWith('admin', 'Admin@1234', 'local-password', 'c-id-1', 'ab3d');
    await vi.advanceTimersByTimeAsync(600);
    expect(assign).toHaveBeenCalledWith('/app/');
  });

  it('点击换一张应重新获取验证码挑战', async () => {
    vi.spyOn(iamAuth, 'fetchLoginProviders').mockResolvedValue(onlyPasswordProviders);
    vi.spyOn(iamAuth, 'login').mockRejectedValueOnce(
      new LoginError('请完成人机验证后重试', true)
    );
    const captchaSpy = vi.spyOn(iamAuth, 'fetchCaptcha')
      .mockResolvedValueOnce({ captchaId: 'c-id-1', type: 'image', content: 'data:image/png;base64,AAAA' })
      .mockResolvedValueOnce({ captchaId: 'c-id-2', type: 'image', content: 'data:image/png;base64,BBBB' });

    const wrapper = mount(LoginView);
    await flushPromises();
    await wrapper.get('input[type="text"]').setValue('admin');
    await wrapper.get('input[type="password"]').setValue('Admin@1234');
    await wrapper.get('form').trigger('submit.prevent');
    await flushPromises();
    expect(wrapper.get('.login-captcha-image').attributes('src')).toBe('data:image/png;base64,AAAA');

    await wrapper.get('.login-captcha-refresh').trigger('click');
    await flushPromises();

    expect(captchaSpy).toHaveBeenCalledTimes(2);
    expect(wrapper.get('.login-captcha-image').attributes('src')).toBe('data:image/png;base64,BBBB');
  });

  it('验证码挑战为非图片类型时应显示兜底提示而不渲染图片', async () => {
    vi.spyOn(iamAuth, 'fetchLoginProviders').mockResolvedValue(onlyPasswordProviders);
    vi.spyOn(iamAuth, 'login').mockRejectedValueOnce(
      new LoginError('请完成人机验证后重试', true)
    );
    vi.spyOn(iamAuth, 'fetchCaptcha').mockResolvedValue({
      captchaId: 'c-id-1',
      type: 'slider',
      content: '{"ticket":"t-1"}'
    });

    const wrapper = mount(LoginView);
    await flushPromises();
    await wrapper.get('input[type="text"]').setValue('admin');
    await wrapper.get('input[type="password"]').setValue('Admin@1234');
    await wrapper.get('form').trigger('submit.prevent');
    await flushPromises();

    expect(wrapper.find('.login-captcha-image').exists()).toBe(false);
    expect(wrapper.get('.login-captcha-unsupported').text()).toContain('暂不支持该验证码类型');
  });

  it('验证码取题失败时应显示重新获取入口', async () => {
    vi.spyOn(iamAuth, 'fetchLoginProviders').mockResolvedValue(onlyPasswordProviders);
    vi.spyOn(iamAuth, 'login').mockRejectedValueOnce(
      new LoginError('请完成人机验证后重试', true)
    );
    vi.spyOn(iamAuth, 'fetchCaptcha').mockRejectedValue(new Error('人机验证暂不可用，请稍后重试'));

    const wrapper = mount(LoginView);
    await flushPromises();
    await wrapper.get('input[type="text"]').setValue('admin');
    await wrapper.get('input[type="password"]').setValue('Admin@1234');
    await wrapper.get('form').trigger('submit.prevent');
    await flushPromises();

    expect(wrapper.find('.login-captcha-image').exists()).toBe(false);
    expect(wrapper.get('.login-captcha-unavailable').text()).toContain('验证码获取失败');
    expect(wrapper.get('.login-captcha-unavailable .login-captcha-refresh').text()).toBe('重新获取');
  });

  it('切换登录方式时应收起验证码区块（阈值按登录方式维度独立）', async () => {
    vi.spyOn(iamAuth, 'fetchLoginProviders').mockResolvedValue({
      defaultProvider: 'local-password',
      providers: [
        onlyPasswordProviders.providers[0],
        {
          code: 'ldap-password',
          name: 'LDAP 登录',
          type: 'ldap',
          enabled: true,
          authorizeUrl: null,
          description: null
        }
      ]
    });
    vi.spyOn(iamAuth, 'login').mockRejectedValueOnce(
      new LoginError('请完成人机验证后重试', true)
    );
    vi.spyOn(iamAuth, 'fetchCaptcha').mockResolvedValue({
      captchaId: 'c-id-1',
      type: 'image',
      content: 'data:image/png;base64,AAAA'
    });

    const wrapper = mount(LoginView);
    await flushPromises();
    await wrapper.get('input[type="text"]').setValue('admin');
    await wrapper.get('input[type="password"]').setValue('Admin@1234');
    await wrapper.get('form').trigger('submit.prevent');
    await flushPromises();
    expect(wrapper.find('.login-captcha').exists()).toBe(true);

    await wrapper.findAll('.login-provider-switch-link')[0].trigger('click');
    await flushPromises();

    expect(wrapper.find('.login-captcha').exists()).toBe(false);
  });

  it('SSO 回调携带禁用错误码时应提示账号已被禁用', async () => {
    vi.spyOn(iamAuth, 'fetchLoginProviders').mockResolvedValue(onlyPasswordProviders);
    Object.defineProperty(window, 'location', {
      value: { assign: vi.fn(), search: '?error=USER_005' },
      writable: true
    });

    const wrapper = mount(LoginView);
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('该账号已被禁用，请联系管理员');
  });

  it('SSO 回调携带未绑定错误码时应提示需要管理员绑定', async () => {
    vi.spyOn(iamAuth, 'fetchLoginProviders').mockResolvedValue(onlyPasswordProviders);
    Object.defineProperty(window, 'location', {
      value: { assign: vi.fn(), search: '?error=BIZ_005' },
      writable: true
    });

    const wrapper = mount(LoginView);
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('该账号需要管理员绑定后才能登录');
  });

  it('SSO 回调携带未知错误码时退回通用文案', async () => {
    vi.spyOn(iamAuth, 'fetchLoginProviders').mockResolvedValue(onlyPasswordProviders);
    Object.defineProperty(window, 'location', {
      value: { assign: vi.fn(), search: '?error=FUTURE_CODE' },
      writable: true
    });

    const wrapper = mount(LoginView);
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('登录失败，请重试');
  });
});
