# simple-iam-login-web 1.0.1 Changelog

## 发布信息

- 版本：`1.0.1`
- 类型：Feature / 向后兼容能力扩展
- 基线版本：`1.0.0`

## 主要变更

- Consent 页面展示可信应用名称和受控应用图标；可信应用未关联或图标编码未知时回退 Client 名称与默认图标。
- Consent 页面复用登录页的品牌布局、主题变量和右侧授权保障信息，保持登录与授权确认的视觉及交互一致。
- 保留 Client 名称作为次级身份信息，应用名称与 Client 名称相同时避免重复展示。

## 兼容性

| 依赖 | 兼容范围 |
| --- | --- |
| IAM Server | `1.1.x` |
| IAM Contract | `1.1.x` |
| IAM Theme Contract | `1.0.0` |

历史 OAuth Client 没有可信应用归属时，Server 返回的应用身份字段为空，前端仍按 Client 名称和默认图标完成授权确认。

## 验证范围

- `vue-tsc`、ESLint、Vitest 覆盖率和生产构建通过。
- 单元测试覆盖 Consent 应用身份展示与图标回退。
- Playwright 生产构建测试通过，覆盖登录、SSO、验证码和回调错误提示流程。
