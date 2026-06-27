# MEMORY.md - 长期记忆

## 项目：HIU-ACM 假期算法集训管理系统
- 路径：`E:\文档\GitHub\Hiu-Acm`
- 技术栈：Cloudflare Workers + D1 + GitHub Pages（Vanilla JS SPA，Fluent 2 风格）
- 架构：GitHub Pages 前端 ↔ Workers API (`workers/api.js`) ↔ D1
- 前端模块：`js/api.js`(API 客户端) / `js/auth.js`(认证) / `js/app.js`(用户端) / `js/admin.js`(管理端) / `js/problems.js`(本地题库，离线参考)
- 后端：`workers/api.js`（单文件 Worker，JWT HS256 24h + SHA-256 哈希 + 接口权限校验）
- API_BASE：`js/api.js` 第一行（远程 worker 域名）

## 关键约定（踩坑点）
- **字段命名**：后端返回下划线（`selected_count`/`completed_count`），前端使用驼峰（`selectedCount`/`completedCount`）。已在 `app.js loadData` 统一映射，新增 stats 消费方务必用驼峰。
- **北京时间**：Worker 跑 UTC，用 `beijingDateStr()`/`beijingTime()` 偏移 +8。
- **login_logs 缓存列**：已加 `region`/`device` 列（migration 002），登录时入库，查询时不再实时调外部 IP API；历史空数据 `enrichLog` 按需回写。
- **前端搜索框**：禁止 oninput 全量 re-render（会失焦），改用 `renderProblemGridOnly` 只刷新网格。
- **admin 数据传递**：禁止把 JSON `stringify` 后嵌入 HTML onclick（转义脆弱）；用 `_usersCache`/`_groupsCache` 按 phone/id 查。
- **problemId 类型陷阱（重要）**：`daily_tasks.problems`/`completed` 存的是字符串数组 `["1001"]`，后端所有涉及 problemId 比较的地方（删除/完成/批量完成/PUT修改）必须用 `String()` 统一类型后再 `includes`/`filter`，否则 `"1001" !== 1001` 静默失效。
- **题库重置接口**：`POST /api/admin/reset-data`，body `{ scope: "stats"|"tasks"|"all" }`，管理端设置页危险操作区调用。

## 部署注意
- 改后端表结构后**必须先跑 migration 再部署 Worker**，否则 INSERT 新列会报错。
- `wrangler.toml` 的 `JWT_SECRET` 当前明文在 `[vars]`，建议改用 `wrangler secret put JWT_SECRET`（代码已兼容 `env.JWT_SECRET`）。
- 本地预览：`python -m http.server 8000`（前端可看，API 走远程 worker）。
