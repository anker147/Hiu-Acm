-- 003: login_logs 增加指纹列
-- 目的：记录浏览器指纹，用于设备识别和安全审计
-- 字段说明：
--   fingerprint  - 综合指纹哈希（16 位 hex），同设备稳定，用于快速比对
--   fp_detail    - 完整指纹详情 JSON（platform/screen/timezone/canvas/webgl 等）
--   ua_parsed    - 从 UA 解析出的设备类型 + 浏览器 + OS（更易读，比纯 device 信息更丰富）
-- 部署：wrangler d1 execute hiu-acm-db --remote --file=migrations/003_login_logs_fingerprint.sql

ALTER TABLE login_logs ADD COLUMN fingerprint TEXT DEFAULT '';
ALTER TABLE login_logs ADD COLUMN fp_detail TEXT DEFAULT '';
ALTER TABLE login_logs ADD COLUMN ua_parsed TEXT DEFAULT '';
