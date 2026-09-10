import { describe, expect, it, vi } from 'vitest';
import { changePassword, fetchAuthorizeUrl, fetchCaptcha, fetchCsrfToken, fetchLoginProviders, LoginError, login } from './iamAuth';

describe('iamAuth api', () => {
  it('fetchLoginProviders 应携带 cookie 并解析登录方式列表', async () => {
    const providers = {
      defaultProvider: 'local-password',
      providers: [
        { code: 'local-password', name: '账号密码登录', type: 'password', enabled: true, authorizeUrl: null, description: null }
      ]
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(providers)
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchLoginProviders()).resolves.toEqual(providers);
    expect(fetchMock).toHaveBeenCalledWith('/iam/web/auth/providers', { credentials: 'include' });
  });

  it('fetchCsrfToken 应携带 cookie 并解析 CSRF 响应', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'token-1' })
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchCsrfToken()).resolves.toEqual({
      headerName: 'X-CSRF-TOKEN',
      parameterName: '_csrf',
      token: 'token-1'
    });
    expect(fetchMock).toHaveBeenCalledWith('/iam/web/auth/csrf', { credentials: 'include' });
  });

  it('CSRF 请求失败时应返回可行动的安全登录会话提示', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    await expect(fetchCsrfToken()).rejects.toThrow('暂时无法建立安全登录会话，请检查网络后重试。');
  });

  it('login 应先取 CSRF，再带 header 和 cookie 提交账号密码', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'token-1' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: '登录成功', user: { username: 'admin', admin: true } })
      });
    vi.stubGlobal('fetch', fetchMock);

    await login('admin', 'Admin@1234');

    expect(fetchMock).toHaveBeenNthCalledWith(2, '/iam/web/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': 'token-1'
      },
      body: JSON.stringify({ username: 'admin', password: 'Admin@1234' })
    });
  });

  it('login 指定外部登录方式时应在请求体携带 provider', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'token-1' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: '登录成功', user: { username: 'ops-user', admin: false } })
      });
    vi.stubGlobal('fetch', fetchMock);

    await login('ops-user', 'Ldap@1234', 'ldap-password');

    expect(fetchMock).toHaveBeenNthCalledWith(2, '/iam/web/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': 'token-1'
      },
      body: JSON.stringify({ username: 'ops-user', password: 'Ldap@1234', provider: 'ldap-password' })
    });
  });

  it('login 401 应提示账号或密码错误，503 应提示服务不可用', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'token-1' })
      })
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'token-1' })
      })
      .mockResolvedValueOnce({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);

    await expect(login('ops-user', 'wrong')).rejects.toThrow('账号或密码错误');
    await expect(login('ops-user', 'Ldap@1234', 'ldap-password')).rejects.toThrow('登录服务暂不可用，请稍后重试');
  });

  it('login 401 携带服务端 message 时应透传（剩余尝试次数提示）', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'token-1' })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          message: '用户名或密码错误，剩余 2 次尝试后将锁定账号',
          user: null,
          captchaRequired: false
        })
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(login('ops-user', 'wrong')).rejects.toThrow('用户名或密码错误，剩余 2 次尝试后将锁定账号');
  });

  it('fetchCaptcha 应携带 cookie 获取人机验证挑战', async () => {
    const challenge = { captchaId: 'c-id-1', type: 'image', content: 'data:image/png;base64,AAAA' };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(challenge)
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchCaptcha()).resolves.toEqual(challenge);
    expect(fetchMock).toHaveBeenCalledWith('/iam/web/auth/captcha', { credentials: 'include' });
  });

  it('fetchCaptcha 失败时应给出可行动提示', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    await expect(fetchCaptcha()).rejects.toThrow('人机验证暂不可用，请稍后重试');
  });

  it('login 携带验证码时应同时上送 captchaId 与 captchaAnswer', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'token-1' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: '登录成功', user: { username: 'admin', admin: true } })
      });
    vi.stubGlobal('fetch', fetchMock);

    await login('admin', 'Admin@1234', 'local-password', 'c-id-1', 'ab3d');

    expect(fetchMock).toHaveBeenNthCalledWith(2, '/iam/web/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': 'token-1'
      },
      body: JSON.stringify({
        username: 'admin',
        password: 'Admin@1234',
        provider: 'local-password',
        captchaId: 'c-id-1',
        captchaAnswer: 'ab3d'
      })
    });
  });

  it('login 401 要求验证码时应抛出带 captchaRequired 的 LoginError 并透传服务端提示', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'token-1' })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ success: false, message: '请完成人机验证后重试', user: null, captchaRequired: true })
      });
    vi.stubGlobal('fetch', fetchMock);

    const error = await login('admin', 'Admin@1234').catch(e => e);
    expect(error).toBeInstanceOf(LoginError);
    expect(error.captchaRequired).toBe(true);
    expect(error.message).toBe('请完成人机验证后重试');
  });

  it('login 401 响应体不可解析时应按普通凭据失败提示', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'token-1' })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.reject(new Error('invalid body'))
      });
    vi.stubGlobal('fetch', fetchMock);

    const error = await login('admin', 'Admin@1234').catch(e => e);
    expect(error).not.toBeInstanceOf(LoginError);
    expect(error.message).toBe('账号或密码错误');
  });

  it('login 400 应透传服务端业务提示（如账号已被禁用）', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'token-1' })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ timestamp: '2026-09-08T10:00:00Z', message: '用户已被禁用：e2e-user' })
      });
    vi.stubGlobal('fetch', fetchMock);

    const error = await login('e2e-user', 'Admin@1234').catch(e => e);
    expect(error).not.toBeInstanceOf(LoginError);
    expect(error.message).toBe('用户已被禁用：e2e-user');
  });

  it('login 400 响应体不可解析时退回通用文案', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'token-1' })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.reject(new Error('invalid body'))
      });
    vi.stubGlobal('fetch', fetchMock);

    const error = await login('admin', 'Admin@1234').catch(e => e);
    expect(error).not.toBeInstanceOf(LoginError);
    expect(error.message).toBe('登录失败，请稍后重试');
  });

  it('fetchAuthorizeUrl 应携带 cookie 请求授权端点并返回跳转地址', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ authorizeUrl: 'https://idp.example.com/auth?state=s1' })
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchAuthorizeUrl('/iam/web/auth/authorize/oidc')).resolves.toEqual('https://idp.example.com/auth?state=s1');
    expect(fetchMock).toHaveBeenCalledWith('/iam/web/auth/authorize/oidc', { credentials: 'include' });
  });

  it('fetchAuthorizeUrl 失败或返回空地址时应给出可行动提示', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 400 })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ authorizeUrl: '' }) }));

    await expect(fetchAuthorizeUrl('/iam/web/auth/authorize/oidc')).rejects.toThrow('登录方式暂不可用，请稍后重试');
    await expect(fetchAuthorizeUrl('/iam/web/auth/authorize/oidc')).rejects.toThrow('登录方式暂不可用，请稍后重试');
  });

  it('fetchAuthorizeUrl 失败时应优先透传服务端具体原因', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ message: '登录方式不存在或未启用：oidc' })
    }));

    await expect(fetchAuthorizeUrl('/iam/web/auth/authorize/oidc')).rejects.toThrow('登录方式不存在或未启用：oidc');
  });

  it('fetchAuthorizeUrl 失败且响应体不可解析时退回通用文案', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.reject(new Error('invalid body'))
    }));

    await expect(fetchAuthorizeUrl('/iam/web/auth/authorize/oidc')).rejects.toThrow('登录方式暂不可用，请稍后重试');
  });

  it('fetchAuthorizeUrl 应透传站内 redirect 且忽略站外地址', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ authorizeUrl: 'https://idp.example.com/auth?state=s1' })
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchAuthorizeUrl('/iam/web/auth/authorize/oidc', '/oauth2/authorize?state=x');
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/iam/web/auth/authorize/oidc?redirect=' + encodeURIComponent('/oauth2/authorize?state=x'),
      { credentials: 'include' }
    );

    await fetchAuthorizeUrl('/iam/web/auth/authorize/oidc', '//evil.example.com');
    expect(fetchMock).toHaveBeenLastCalledWith('/iam/web/auth/authorize/oidc', { credentials: 'include' });
  });

  it('changePassword 应先取 CSRF 再以 PUT 提交新旧密码', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'token-1' })
      })
      .mockResolvedValueOnce({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);

    await expect(changePassword('Admin@1234', 'NewPass@1234')).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenNthCalledWith(2, '/iam/web/auth/password', {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': 'token-1'
      },
      body: JSON.stringify({ oldPassword: 'Admin@1234', newPassword: 'NewPass@1234' })
    });
  });

  it('changePassword 会话失效（401）时应提示重新登录', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'token-1' })
      })
      .mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.reject(new Error('no body')) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(changePassword('Admin@1234', 'NewPass@1234')).rejects.toThrow('登录态已失效，请重新登录后再修改密码');
  });

  it('changePassword 400 应透传服务端策略/权限提示', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'token-1' })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: '新密码必须包含大写字母' })
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(changePassword('Admin@1234', 'weak')).rejects.toThrow('新密码必须包含大写字母');
  });

  it('changePassword 失败且响应体不可解析时退回通用文案', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'token-1' })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('invalid body'))
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(changePassword('Admin@1234', 'NewPass@1234')).rejects.toThrow('修改密码失败，请稍后重试');
  });
});
