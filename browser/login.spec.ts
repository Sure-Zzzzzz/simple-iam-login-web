import { expect, test } from '@playwright/test';

const brandingRoute = (page: import('@playwright/test').Page) =>
  page.route('**/iam/web/branding', route =>
    route.fulfill({ json: { name: '统一认证中心', logoUrl: null, customCssUrl: null, customJsUrl: null } }));

test('生产构建中登录页固定浅色并提供可读错误提示', async ({ page }) => {
  await brandingRoute(page);
  await page.route('**/iam/web/auth/providers', route => route.fulfill({ json: { defaultProvider: 'local-password', providers: [] } }));

  await page.goto('/login');
  await page.getByRole('button', { name: '登录' }).click();

  await expect(page.locator('html')).toHaveAttribute('data-iam-theme', 'light');
  await expect(page.getByRole('alert')).toHaveText('请输入账号和密码');
  await expect(page.getByRole('textbox', { name: '账号' })).toBeFocused();
});

test('密码框眼睛按钮应在明文与密文间切换', async ({ page }) => {
  await brandingRoute(page);
  await page.route('**/iam/web/auth/providers', route => route.fulfill({ json: { defaultProvider: 'local-password', providers: [] } }));

  await page.goto('/login');
  const passwordInput = page.getByRole('textbox', { name: '密码' });
  await expect(passwordInput).toHaveAttribute('type', 'password');

  await page.getByRole('button', { name: '显示密码' }).click();
  await expect(passwordInput).toHaveAttribute('type', 'text');
  await expect(page.getByRole('button', { name: '隐藏密码' })).toBeVisible();

  await page.getByRole('button', { name: '隐藏密码' }).click();
  await expect(passwordInput).toHaveAttribute('type', 'password');
});

test('1920 视口下登录卡应垂直居中', async ({ page }) => {
  await brandingRoute(page);
  await page.route('**/iam/web/auth/providers', route => route.fulfill({ json: { defaultProvider: 'local-password', providers: [] } }));

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/login');

  const box = await page.locator('.login-card').boundingBox();
  expect(box).not.toBeNull();
  const cardCenterY = box!.y + box!.height / 2;
  expect(Math.abs(cardCenterY - 1080 / 2)).toBeLessThan(2);
});

test('LDAP 登录方式应以底部切换链接呈现并在提交时携带 provider', async ({ page }) => {
  await brandingRoute(page);
  await page.route('**/iam/web/auth/providers', route => route.fulfill({
    json: {
      defaultProvider: 'local-password',
      providers: [
        { code: 'local-password', name: '账号密码登录', type: 'password', enabled: true, authorizeUrl: null, description: null },
        { code: 'ldap-password', name: 'LDAP 登录', type: 'ldap', enabled: true, authorizeUrl: null, description: null }
      ]
    }
  }));
  await page.route('**/iam/web/auth/csrf', route =>
    route.fulfill({ json: { headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'token-1' } }));
  const loginRequest = page.waitForRequest(request => request.url().includes('/iam/web/auth/login'));
  await page.route('**/iam/web/auth/login', route =>
    route.fulfill({ json: { message: '登录成功', user: { userId: 1, username: 'ops-user', displayName: null, admin: false, authorities: [] } } }));

  await page.goto('/login');
  await expect(page.getByText('请使用账号密码登录。')).toBeVisible();
  await page.getByRole('button', { name: '使用 LDAP 登录 →' }).click();
  await expect(page.getByText('请使用LDAP 登录。')).toBeVisible();
  await expect(page.getByRole('button', { name: '使用 账号密码登录 →' })).toBeVisible();

  await page.getByRole('textbox', { name: '账号' }).fill('ops-user');
  await page.getByRole('textbox', { name: '密码' }).fill('Ldap@1234');
  await page.getByRole('button', { name: '登录', exact: true }).click();

  const request = await loginRequest;
  expect(request.postDataJSON()).toEqual({
    username: 'ops-user',
    password: 'Ldap@1234',
    provider: 'ldap-password'
  });
});

test('SSO 登录方式应先请求授权端点再跳转外部 IdP', async ({ page }) => {
  await brandingRoute(page);
  await page.route('**/iam/web/auth/providers', route => route.fulfill({
    json: {
      defaultProvider: 'local-password',
      providers: [
        { code: 'local-password', name: '账号登录', type: 'password', enabled: true, authorizeUrl: null, description: null },
        { code: 'oidc', name: '企业统一登录', type: 'sso', enabled: true, authorizeUrl: '/iam/web/auth/authorize/oidc', description: null }
      ]
    }
  }));
  const authorizeRequest = page.waitForRequest(request => request.url().includes('/iam/web/auth/authorize/oidc'));
  await page.route('**/iam/web/auth/authorize/oidc', route =>
    route.fulfill({ json: { authorizeUrl: 'https://idp.example.test/auth?state=s1' } }));
  await page.route('https://idp.example.test/**', route =>
    route.fulfill({ body: '<html><body>IdP 登录页</body></html>', contentType: 'text/html' }));

  await page.goto('/login');
  await page.getByRole('button', { name: '企业统一登录' }).click();

  await authorizeRequest;
  await expect(page).toHaveURL('https://idp.example.test/auth?state=s1');
});

test('回调失败重定向回登录页时应展示错误提示', async ({ page }) => {
  await brandingRoute(page);
  await page.route('**/iam/web/auth/providers', route => route.fulfill({ json: { defaultProvider: 'local-password', providers: [] } }));

  await page.goto('/?error=BIZ_004');

  await expect(page).toHaveURL(/\/login\?error=BIZ_004/);
  await expect(page.getByRole('alert')).toHaveText('登录未通过校验，请重试');
});

test('登录被要求人机验证时应展示验证码区块并在重试时携带答案', async ({ page }) => {
  await brandingRoute(page);
  await page.route('**/iam/web/auth/providers', route => route.fulfill({ json: { defaultProvider: 'local-password', providers: [] } }));
  await page.route('**/iam/web/auth/csrf', route =>
    route.fulfill({ json: { headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'token-1' } }));
  await page.route('**/iam/web/auth/captcha', route =>
    route.fulfill({ json: { captchaId: 'c-id-1', type: 'image', content: 'data:image/png;base64,AAAA' } }));
  await page.route('**/iam/web/auth/login', async route => {
    const request = route.request();
    const body = request.postDataJSON();
    if (body.captchaAnswer === 'ab3d') {
      await route.fulfill({
        json: { message: '登录成功', user: { userId: 1, username: 'admin', displayName: null, admin: true, authorities: [] } }
      });
    } else {
      await route.fulfill({
        status: 401,
        json: { message: '请完成人机验证后重试', user: null, captchaRequired: true }
      });
    }
  });

  await page.goto('/login');
  await expect(page.locator('.login-captcha')).toHaveCount(0);

  await page.getByRole('textbox', { name: '账号' }).fill('admin');
  await page.getByRole('textbox', { name: '密码' }).fill('Admin@1234');
  await page.getByRole('button', { name: '登录' }).click();

  await expect(page.getByRole('alert')).toHaveText('请完成人机验证后重试');
  await expect(page.locator('.login-captcha-image')).toHaveAttribute('src', 'data:image/png;base64,AAAA');
  await expect(page.locator('.login-captcha-refresh')).toBeVisible();

  const retriedRequest = page.waitForRequest(request =>
    request.url().includes('/iam/web/auth/login') && request.postDataJSON()?.captchaAnswer === 'ab3d');
  await page.getByPlaceholder('请输入图片中的字符').fill('ab3d');
  await page.getByRole('button', { name: '登录' }).click();

  const request = await retriedRequest;
  expect(request.postDataJSON()).toEqual({
    username: 'admin',
    password: 'Admin@1234',
    provider: 'local-password',
    captchaId: 'c-id-1',
    captchaAnswer: 'ab3d'
  });
  await expect(page.getByRole('status')).toHaveText('登录成功，正在进入统一应用门户');
});

test('点击换一张应重新获取验证码挑战', async ({ page }) => {
  await brandingRoute(page);
  await page.route('**/iam/web/auth/providers', route => route.fulfill({ json: { defaultProvider: 'local-password', providers: [] } }));
  await page.route('**/iam/web/auth/csrf', route =>
    route.fulfill({ json: { headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'token-1' } }));
  let captchaFetchCount = 0;
  await page.route('**/iam/web/auth/captcha', route => {
    captchaFetchCount += 1;
    route.fulfill({ json: { captchaId: `c-id-${captchaFetchCount}`, type: 'image', content: `data:image/png;base64,${'A'.repeat(captchaFetchCount)}` } });
  });
  await page.route('**/iam/web/auth/login', route =>
    route.fulfill({
      status: 401,
      json: { message: '请完成人机验证后重试', user: null, captchaRequired: true }
    }));

  await page.goto('/login');
  await page.getByRole('textbox', { name: '账号' }).fill('admin');
  await page.getByRole('textbox', { name: '密码' }).fill('Admin@1234');
  await page.getByRole('button', { name: '登录' }).click();

  await expect(page.locator('.login-captcha-image')).toHaveAttribute('src', 'data:image/png;base64,A');
  await page.locator('.login-captcha-refresh').click();
  await expect(page.locator('.login-captcha-image')).toHaveAttribute('src', 'data:image/png;base64,AA');
});
