# simple-iam-login-web

IAM 的登录与授权确认前端，提供 `/login`、`/consent` 与 `/change-password`。

首次登录或密码被重置后，登录响应携带 `mustChangePassword: true`，前端强制跳转 `/change-password` 完成改密后才能继续；改密提交 `PUT /iam/web/auth/password`（携带 CSRF token），成功后该用户其他已登录终端的会话全部失效，并按 `redirect` 参数回跳原目标，无目标时跳转 `/app/`。

## 兼容性与发布

| 组件 | 版本 |
| --- | --- |
| Login Web | `1.1.0` |
| IAM Server | `1.3.0`（兼容 `1.3.x` 的向后兼容 patch） |
| IAM Contract | `1.3.0`（兼容 `1.3.x` 的向后兼容 patch） |
| IAM Theme Contract | `1.0.0` |
- 首次独立发布计划与 IAM Server `1.0.0` 对齐，使用同版本 Git tag `v1.0.0`。
- `1.0.1` 对齐 IAM Server `1.1.1` 的 Consent 应用身份字段；历史 Client 没有关联可信应用时仍回退 Client 名称和默认图标。
- `1.1.0` 对齐 IAM Server `1.3.0` 的手机号验证码登录、手机号找回密码和登录方式动态发现契约；未装配短信投递能力时不展示手机号入口。
- 后续 Web patch 可独立发布，但必须在 release notes 中声明兼容的 Server 与 Contract 范围。

权威 API 契约由 IAM Server 仓库的 `sdk/auth/iam/server/contract/` 维护；不得调用未声明接口。

## 本地开发

前置条件：Node.js 22+、pnpm 9.15.4，以及运行在 `http://localhost:8180` 的 IAM Server。

```bash
npx pnpm@9.15.4 install
npx pnpm@9.15.4 run dev
```

开发服务器固定使用 `5174`。`/iam`、`/oauth2` 代理至 IAM Server；`/app` 代理至 Portal（`5176`），`/micro` 代理至 Admin（`5175`），用于同源联调。

## 验证

```bash
npx pnpm@9.15.4 run type-check
npx pnpm@9.15.4 run lint
npx pnpm@9.15.4 run test:run
npx pnpm@9.15.4 run build
```
