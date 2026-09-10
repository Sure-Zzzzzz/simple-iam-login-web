export interface CsrfTokenResponse {
  headerName: string;
  parameterName: string;
  token: string;
}

export interface AuthUser {
  userId: number | null;
  username: string;
  displayName: string | null;
  admin: boolean;
  authorities: string[];
}

export interface LoginResponse {
  message: string;
  user: AuthUser;
  captchaRequired?: boolean;
  mustChangePassword?: boolean;
}

export interface CaptchaChallenge {
  captchaId: string;
  type: string;
  content: string;
}

export class LoginError extends Error {
  readonly captchaRequired: boolean;

  constructor(message: string, captchaRequired: boolean) {
    super(message);
    this.name = 'LoginError';
    this.captchaRequired = captchaRequired;
  }
}

export interface ConsentInfo {
  registeredClientId: string;
  clientId: string;
  clientName: string;
  state: string;
  requestedScopes: string[];
  previouslyApprovedScopes: string[];
}

export interface LoginProvider {
  code: string;
  name: string;
  type: 'password' | 'ldap' | 'sso' | string;
  enabled: boolean;
  authorizeUrl: string | null;
  description: string | null;
}

export interface LoginProvidersResponse {
  defaultProvider: string;
  providers: LoginProvider[];
}

export interface AuthorizeResponse {
  authorizeUrl: string;
}

export interface Branding {
  name: string;
  logoUrl: string | null;
  customCssUrl: string | null;
  customJsUrl: string | null;
}

export const DEFAULT_BRAND_NAME = '统一认证中心';

export async function fetchLoginProviders(): Promise<LoginProvidersResponse> {
  const response = await fetch('/iam/web/auth/providers', {
    credentials: 'include'
  });
  if (!response.ok) {
    throw new Error('获取登录方式失败');
  }
  return response.json();
}

export async function fetchBranding(): Promise<Branding> {
  const response = await fetch('/iam/web/branding', {
    credentials: 'include'
  });
  if (!response.ok) {
    throw new Error('获取品牌信息失败');
  }
  return response.json();
}

export async function fetchCsrfToken(): Promise<CsrfTokenResponse> {
  const response = await fetch('/iam/web/auth/csrf', {
    credentials: 'include'
  });
  if (!response.ok) {
    throw new Error('暂时无法建立安全登录会话，请检查网络后重试。');
  }
  return response.json();
}

export async function fetchCaptcha(): Promise<CaptchaChallenge> {
  const response = await fetch('/iam/web/auth/captcha', {
    credentials: 'include'
  });
  if (!response.ok) {
    throw new Error('人机验证暂不可用，请稍后重试');
  }
  return response.json();
}

export async function login(
  username: string,
  password: string,
  provider?: string,
  captchaId?: string,
  captchaAnswer?: string
): Promise<LoginResponse> {
  const csrf = await fetchCsrfToken();
  const requestBody: Record<string, string> = { username, password };
  if (provider) {
    requestBody.provider = provider;
  }
  if (captchaId) {
    requestBody.captchaId = captchaId;
  }
  if (captchaAnswer) {
    requestBody.captchaAnswer = captchaAnswer;
  }
  const response = await fetch('/iam/web/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      [csrf.headerName]: csrf.token
    },
    body: JSON.stringify(requestBody)
  });
  if (response.status === 401) {
    let captchaRequired = false;
    let serverMessage = '';
    try {
      const failureBody = await response.json();
      captchaRequired = failureBody?.captchaRequired === true;
      serverMessage = typeof failureBody?.message === 'string' ? failureBody.message : '';
    } catch {
      // 响应体不可解析时按普通凭据失败处理
    }
    if (captchaRequired) {
      throw new LoginError(serverMessage || '请完成人机验证后重试', true);
    }
    throw new Error(serverMessage || '账号或密码错误');
  }
  if (response.status === 503) {
    throw new Error('登录服务暂不可用，请稍后重试');
  }
  if (!response.ok) {
    let serverMessage = '';
    try {
      const failureBody = await response.json();
      serverMessage = typeof failureBody?.message === 'string' ? failureBody.message : '';
    } catch {
      // 响应体不可解析时退回通用文案
    }
    throw new Error(serverMessage || '登录失败，请稍后重试');
  }
  return response.json();
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  const csrf = await fetchCsrfToken();
  const response = await fetch('/iam/web/auth/password', {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      [csrf.headerName]: csrf.token
    },
    body: JSON.stringify({ oldPassword, newPassword })
  });
  if (response.status === 401) {
    throw new Error('登录态已失效，请重新登录后再修改密码');
  }
  if (!response.ok) {
    let serverMessage = '';
    try {
      const failureBody = await response.json();
      serverMessage = typeof failureBody?.message === 'string' ? failureBody.message : '';
    } catch {
      // 响应体不可解析时退回通用文案
    }
    throw new Error(serverMessage || '修改密码失败，请稍后重试');
  }
}

export async function fetchAuthorizeUrl(authorizeEndpoint: string, redirect?: string | null): Promise<string> {
  const target = redirect && redirect.startsWith('/') && !redirect.startsWith('//')
    ? `${authorizeEndpoint}?redirect=${encodeURIComponent(redirect)}`
    : authorizeEndpoint;
  const response = await fetch(target, {
    credentials: 'include'
  });
  if (!response.ok) {
    let serverMessage = '';
    try {
      const failureBody = await response.json();
      serverMessage = typeof failureBody?.message === 'string' ? failureBody.message : '';
    } catch {
      // 响应体不可解析时退回通用文案
    }
    throw new Error(serverMessage || '登录方式暂不可用，请稍后重试');
  }
  const result: AuthorizeResponse = await response.json();
  if (!result.authorizeUrl) {
    throw new Error('登录方式暂不可用，请稍后重试');
  }
  return result.authorizeUrl;
}

export async function fetchConsentInfo(state: string): Promise<ConsentInfo> {
  const response = await fetch(`/iam/web/oauth2/consent-info?state=${encodeURIComponent(state)}`, {
    credentials: 'include'
  });
  if (!response.ok) {
    throw new Error('获取授权信息失败');
  }
  return response.json();
}
