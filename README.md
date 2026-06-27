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

# 导入种子数据
wrangler d1 execute hiu-acm-db --file=seed.sql
```

### 2. Cloudflare Workers

```bash
cd workers
# 修改 wrangler.toml 中的 JWT_SECRET 为自定义密钥

# 部署 API
wrangler deploy
```

### 3. 前端部署

修改 `js/api.js` 第一行的 `API_BASE` 为你的 Worker 域名：
推送到 GitHub，在 Settings → Pages 启用。

### 4. 管理员与学员

部署后可通过管理端登录（admin 账号 + 自定义密码）添加学员并分配校验码。

<<<<<<< HEAD
## 技术栈

- **前端**: Vanilla JS SPA / CSS Fluent 2 风格
- **后端**: Cloudflare Workers
- **数据库**: Cloudflare D1
- **部署**: GitHub Pages
=======
>>>>>>> 22e9b5ef0045d45086a85e1dce1dd79d97bc82f0

## 项目结构

```
├── index.html              # SPA 入口
├── .nojekyll               # GitHub Pages
├── css/
│   └── style.css           # Fluent 2 亚克力风格
├── js/
│   ├── problems.js         # 本地题库（离线参考）
│   ├── api.js              # Worker API 客户端
│   ├── auth.js             # 认证模块
│   ├── app.js              # 用户端：题单选择/完成/历史/小组
│   └── admin.js            # 管理端：数据面板/用户/小组/日志
├── migrations/
│   └── 001_schema.sql      # D1 建表
└── workers/
    ├── wrangler.toml       # Worker 配置
    ├── api.js              # Worker API 全量代码
    └── seed.sql            # 种子数据
```

## 安全特性

- JWT HS256 令牌认证，24小时过期
- 所有密码/校验码 SHA-256 哈希存储
- 接口级权限校验
- HTTPS 全链路加密
- 登录日志记录
