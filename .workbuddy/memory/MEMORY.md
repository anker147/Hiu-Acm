# MEMORY.md - 长期记忆

## 项目：HIU-ACM 假期算法集训管理系统
- 路径：`E:\文档\GitHub\Hiu-Acm`
- 技术栈：Cloudflare Workers + D1 + Cloudflare Pages（Vanilla JS SPA，Fluent 2 风格）
- 架构（2026-06-27 改）：Cloudflare Pages 前端 + Pages Functions 反代 (`functions/api/[[path]].js`) → 原 Worker API (`workers/api.js`) → D1
- 生产入口：`https://hiu-acm.pages.dev`（前端 + `/api/*` 同源，走 Pages CDN）
- 前端模块：`js/api.js`(API 客户端) / `js/auth.js`(认证) / `js/app.js`(用户端) / `js/admin.js`(管理端) / `js/problems.js`(本地题库，离线参考)
- 后端：`workers/api.js`（单文件 Worker，JWT HS256 24h + SHA-256 哈希 + 接口权限校验）
- API_BASE：`js/api.js` 第 6-7 行三目运算 — 生产走 `/api`（同源），本地 (localhost/127.0.0.1) 走直连 Worker

## 关键约定（踩坑点）
- **字段命名**：后端返回下划线（`selected_count`/`completed_count`），前端使用驼峰（`selectedCount`/`completedCount`）。已在 `app.js loadData` 统一映射，新增 stats 消费方务必用驼峰。
- **北京时间**：Worker 跑 UTC，用 `beijingDateStr()`/`beijingTime()` 偏移 +8。
- **login_logs 缓存列**：已加 `region`/`device` 列（migration 002），登录时入库，查询时不再实时调外部 IP API；历史空数据 `enrichLog` 按需回写。
- **前端搜索框**：禁止 oninput 全量 re-render（会失焦），改用 `renderProblemGridOnly` 只刷新网格。
- **admin 数据传递**：禁止把 JSON `stringify` 后嵌入 HTML onclick（转义脆弱）；用 `_usersCache`/`_groupsCache` 按 phone/id 查。
- **problemId 类型陷阱（重要）**：`daily_tasks.problems`/`completed` 存的是字符串数组 `["1001"]`，后端所有涉及 problemId 比较的地方（删除/完成/批量完成/PUT修改）必须用 `String()` 统一类型后再 `includes`/`filter`，否则 `"1001" !== 1001` 静默失效。
- **题库重置接口**：`POST /api/admin/reset-data`，body `{ scope: "stats"|"tasks"|"all" }`，管理端设置页危险操作区调用。
- **移动端登录失效（重要）**：token 必须用 `localStorage`，**禁止用 `sessionStorage`**。原因：iOS 私密浏览/微信内置/X5 内核/Android Chrome 切后台都会清空 `sessionStorage`，导致「登录成功 → 后续请求 401 掉线」。代码已统一改用 `localStorage`（`js/auth.js` 的 `tokenStore` + `js/api.js` 的 `setToken/init`），`sessionStorage` 在前端代码中不应再出现。

## 部署注意
- **两套部署独立（重要！）**：
  1. **前端 + 反代**：`npx wrangler pages deploy . --project-name=hiu-acm --branch=main` → 更新 `hiu-acm.pages.dev`
  2. **后端 Worker**：`npx wrangler deploy workers/api.js --env=""` → 更新业务 API
  3. 改前端代码必须跑 1，改 `workers/api.js` 必须跑 2，两者互不影响
- **git push 不再更新生产前端**（GitHub Pages 已不是生产入口，Cloudflare Pages 才是）；git push 只是同步源码到 GitHub
- **workers.dev 国内不可达（重要！）**：未登录过系统的设备首次访问 workers.dev 会因 DNS/HTTP3/TLS ECH 失败；解决方案是 Pages 反代（已实施）。如未来 pages.dev 也出现类似问题，需考虑绑定 ICP 备案的自定义域名
- 改后端表结构后**必须先跑 migration 再部署 Worker**，否则 INSERT 新列会报错。
- `wrangler.toml` 的 `JWT_SECRET` 当前明文在 `[vars]`，建议改用 `wrangler secret put JWT_SECRET`（代码已兼容 `env.JWT_SECRET`）。
- 本地预览：`python -m http.server 8000`（前端可看，API 走远程 worker）。
- 部署 Worker 后提醒用户 **Ctrl+F5 强制刷新浏览器**，避免前端 JS 缓存。
