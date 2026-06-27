-- 002: login_logs 增加 region / device 缓存列
-- 目的：避免 admin 查询登录日志时对每条记录实时调用 ip-api.com（性能灾难 + 触发限流）
-- 登录时已计算并写入这两列；查询时直接读取，仅历史空数据按需回写
--
-- 部署：wrangler d1 execute hiu-acm-db --file=../migrations/002_login_logs_region.sql

ALTER TABLE login_logs ADD COLUMN region TEXT DEFAULT '';
ALTER TABLE login_logs ADD COLUMN device TEXT DEFAULT '';
