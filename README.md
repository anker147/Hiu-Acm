---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 47b669680a5d8ee44201d9f85830a291_434bb9de717c11f1897e5254002afed2
    ReservedCode1: BsN7ZVrcr/0L+LVRsL5YIWjznm2uiyAcT2/rJHa4Qgn7L1S/3gamgqI0GyjeUE62xSt7dzF3ECrTY7cB+yshQymd6mEkyLeNiwmrM+qiMICJbClBWfV5YieK21fKh85AfXFb3fiZdSuRzPjfg7BaTaei4uqhsSt0gHQcIhFZtBJDu8Hhbm/cWG5PaZM=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 47b669680a5d8ee44201d9f85830a291_434bb9de717c11f1897e5254002afed2
    ReservedCode2: BsN7ZVrcr/0L+LVRsL5YIWjznm2uiyAcT2/rJHa4Qgn7L1S/3gamgqI0GyjeUE62xSt7dzF3ECrTY7cB+yshQymd6mEkyLeNiwmrM+qiMICJbClBWfV5YieK21fKh85AfXFb3fiZdSuRzPjfg7BaTaei4uqhsSt0gHQcIhFZtBJDu8Hhbm/cWG5PaZM=
---

# HIU-ACM 假期算法集训管理系统

基于 Cloudflare Workers + D1 + GitHub Pages 的集训进度管理平台。

## 架构

```
GitHub Pages (前端) ←→ Cloudflare Workers (API) ←→ D1 (数据库)
```

## 快速部署

### 1. Cloudflare D1 数据库

```bash
npm install -g wrangler
cd workers

# 创建 D1 数据库
wrangler d1 create hiu-acm-db

# 将输出的 database_id 填入 wrangler.toml 的 d1_databases.database_id

# 执行表结构迁移
wrangler d1 execute hiu-acm-db --file=../migrations/001_schema.sql

# 导入种子数据（200道题 + 管理员密码）
wrangler d1 execute hiu-acm-db --file=seed.sql
```

### 2. Cloudflare Workers

```bash
cd workers
# 部署 API
wrangler deploy

# 将 wrangler.toml 中的 JWT_SECRET 改为自己的密钥
# 或通过 dashboard 设置环境变量
```

### 3. 前端部署

修改 `js/api.js` 第一行的 `API_BASE` 为你的 Worker 域名：

```js
const API_BASE = "https://your-worker.workers.dev";
```

推送到 GitHub，在 Settings → Pages 启用。

### 4. 创建学员

在 Worker 部署后，可以通过管理端添加学员，或直接在 D1 执行 SQL：

```sql
INSERT INTO users (phone, name, code_hash, is_admin, code_type)
VALUES ('13800001111', '张三', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', 0, 'permanent');
```

> 其中 `code_hash` 为 SHA-256("123456")，管理员可在后台为每位学员设置专属校验码。

## 默认凭据

| 角色 | 账号 | 密码/校验码 |
|------|------|-------------|
| 管理员 | admin | text123 |
| 学员 | 11位手机号 | 123456（默认，管理员可修改） |

## 管理员密码哈希

`text123` 的 SHA-256: `99c24b7d36d81ac8c58e05e80d8f01ad0544bbcef5b9f04b20fe6666b2af47ae`

可在 D1 中修改：
```sql
UPDATE admin_settings SET value = '<new_sha256>' WHERE key = 'admin_password_hash';
```

## 项目结构

```
├── index.html              # SPA 入口
├── .nojekyll               # GitHub Pages
├── css/
│   └── style.css           # Fluent 2 亚克力风格
├── js/
│   ├── problems.js         # 200道题本地题库（离线参考）
│   ├── api.js              # Worker API 客户端
│   ├── auth.js             # 认证模块
│   ├── app.js              # 用户端：题单选择/完成/历史
│   └── admin.js            # 管理端：数据面板/用户/小组/日志
├── migrations/
│   └── 001_schema.sql      # D1 建表
└── workers/
    ├── wrangler.toml       # Worker 配置
    ├── api.js              # Worker API 全量代码
    └── seed.sql            # 种子数据
```

## 安全设计

- JWT HS256 令牌，24小时过期
- 所有密码/校验码 SHA-256 哈希存储
- 接口级权限校验（`isAdmin` 字段）
- HTTPS 全链路加密
- 登录日志 IP + UA 记录
*（内容由AI生成，仅供参考）*
