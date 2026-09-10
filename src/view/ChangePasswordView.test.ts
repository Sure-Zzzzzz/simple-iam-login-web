import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChangePasswordView from './ChangePasswordView.vue';
import * as iamAuth from '../api/iamAuth';

const routerPush = vi.fn();

function mountView() {
  return mount(ChangePasswordView, {
    global: {
      mocks: {
        $router: { push: routerPush }
      }
    }
  });
}

describe('ChangePasswordView', () => {
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
    routerPush.mockClear();
  });

  it('应渲染原密码、新密码、确认新密码三框与说明文案', async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.get('.login-card-header').text()).toContain('修改密码');
    expect(wrapper.get('.login-card-header').text()).toContain('首次登录或密码被重置后，须先设置新密码才能继续使用。');
    expect(wrapper.get('.login-brand-copy p').text()).toContain('修改完成后，其他已登录终端将自动退出');
    const passwordFields = wrapper.findAll('input[autocomplete="current-password"], input[autocomplete="new-password"]');
    expect(passwordFields).toHaveLength(3);
    expect(wrapper.get('button[type="submit"]').text()).toBe('确认修改');
    expect(wrapper.text()).toContain('返回登录');
  });

  it('三框任一为空提交应提示必填且不调用改密 API', async () => {
    const changeSpy = vi.spyOn(iamAuth, 'changePassword');

    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('form').trigger('submit.prevent');

    expect(wrapper.get('[role="alert"]').text()).toBe('请填写原密码、新密码和确认新密码');
    expect(changeSpy).not.toHaveBeenCalled();
  });

  it('两次输入的新密码不一致应提示且不调用改密 API', async () => {
    const changeSpy = vi.spyOn(iamAuth, 'changePassword');

    const wrapper = mountView();
    await flushPromises();
    await wrapper.get('input[autocomplete="current-password"]').setValue('Admin@1234');
    const newPasswords = wrapper.findAll('input[autocomplete="new-password"]');
    await newPasswords[0].setValue('NewPass@1234');
    await newPasswords[1].setValue('Different@1234');
    await wrapper.get('form').trigger('submit.prevent');

    expect(wrapper.get('[role="alert"]').text()).toBe('两次输入的新密码不一致');
    expect(changeSpy).not.toHaveBeenCalled();
  });

  it('确认新密码失焦即比对，不一致无需提交就提示', async () => {
    const changeSpy = vi.spyOn(iamAuth, 'changePassword');

    const wrapper = mountView();
    await flushPromises();
    await wrapper.get('input[autocomplete="current-password"]').setValue('Admin@1234');
    const newPasswords = wrapper.findAll('input[autocomplete="new-password"]');
    await newPasswords[0].setValue('NewPass@1234');
    await newPasswords[1].setValue('Different@1234');
    await newPasswords[1].trigger('blur');

    expect(wrapper.get('[role="alert"]').text()).toBe('两次输入的新密码不一致');
    expect(changeSpy).not.toHaveBeenCalled();
  });

  it('失焦比对一致时应清除不一致提示', async () => {
    const wrapper = mountView();
    await flushPromises();
    const newPasswords = wrapper.findAll('input[autocomplete="new-password"]');
    await newPasswords[0].setValue('NewPass@1234');
    await newPasswords[1].setValue('Different@1234');
    await newPasswords[1].trigger('blur');
    expect(wrapper.get('[role="alert"]').text()).toBe('两次输入的新密码不一致');

    await newPasswords[1].setValue('NewPass@1234');
    await newPasswords[1].trigger('blur');

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('提交应以原密码与新密码调用改密 API，成功后提示并跳转门户', async () => {
    const changeSpy = vi.spyOn(iamAuth, 'changePassword').mockResolvedValue(undefined);
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { value: { assign }, writable: true });

    const wrapper = mountView();
    await flushPromises();
    vi.useFakeTimers();
    await wrapper.get('input[autocomplete="current-password"]').setValue('Admin@1234');
    const newPasswords = wrapper.findAll('input[autocomplete="new-password"]');
    await newPasswords[0].setValue('NewPass@1234');
    await newPasswords[1].setValue('NewPass@1234');
    await wrapper.get('form').trigger('submit.prevent');
    await flushPromises();

    expect(changeSpy).toHaveBeenCalledWith('Admin@1234', 'NewPass@1234');
    expect(wrapper.get('[role="status"]').text()).toBe('密码修改成功，正在进入统一应用门户');
    expect(assign).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(assign).toHaveBeenCalledWith('/app/');
  });

  it('携带 redirect 参数时改密成功应回跳原目标', async () => {
    vi.spyOn(iamAuth, 'changePassword').mockResolvedValue(undefined);
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { assign, search: '?redirect=%2Foauth2%2Fauthorize%3Fclient_id%3Ddemo' },
      writable: true
    });

    const wrapper = mountView();
    await flushPromises();
    vi.useFakeTimers();
    await wrapper.get('input[autocomplete="current-password"]').setValue('Admin@1234');
    const newPasswords = wrapper.findAll('input[autocomplete="new-password"]');
    await newPasswords[0].setValue('NewPass@1234');
    await newPasswords[1].setValue('NewPass@1234');
    await wrapper.get('form').trigger('submit.prevent');
    await flushPromises();

    await vi.advanceTimersByTimeAsync(600);
    expect(assign).toHaveBeenCalledWith('/oauth2/authorize?client_id=demo');
  });

  it('改密失败应展示服务端错误且不跳转', async () => {
    vi.spyOn(iamAuth, 'changePassword').mockRejectedValue(new Error('新密码必须包含大写字母'));
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { value: { assign }, writable: true });

    const wrapper = mountView();
    await flushPromises();
    await wrapper.get('input[autocomplete="current-password"]').setValue('Admin@1234');
    const newPasswords = wrapper.findAll('input[autocomplete="new-password"]');
    await newPasswords[0].setValue('weak');
    await newPasswords[1].setValue('weak');
    await wrapper.get('form').trigger('submit.prevent');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('新密码必须包含大写字母');
    expect(assign).not.toHaveBeenCalled();
  });

  it('点击返回登录应回登录页', async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('.login-provider-switch-link').trigger('click');

    expect(routerPush).toHaveBeenCalledWith('/login');
  });
});
