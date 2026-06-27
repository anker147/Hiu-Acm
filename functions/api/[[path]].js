// Cloudflare Pages Functions 反代
// 把 /api/* 请求转发到原 Worker API
// 目的：通过 pages.dev 域名走 Cloudflare Pages CDN 节点，提升国内可达性
//
// 路径匹配：/api/<path> → https://hiu-acm-api.wangyiyouxiang0719.workers.dev/api/<path>

const UPSTREAM = "https://hiu-acm-api.wangyiyouxiang0719.workers.dev";

export async function onRequest(context) {
  const { request, params } = context;

  // CORS 预检
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400"
      }
    });
  }

  // params.path 是 catch-all 数组（[[path]] 语法）
  const pathSegments = params.path || [];
  const pathStr = Array.isArray(pathSegments) ? pathSegments.join("/") : String(pathSegments || "");
  const url = new URL(request.url);
  const targetUrl = `${UPSTREAM}/api/${pathStr}${url.search}`;

  // 透传请求头，但更新 Host
  const headers = new Headers(request.headers);
  headers.set("Host", new URL(UPSTREAM).host);
  // 让上游看到真实客户端 IP（与原 Worker 取 CF-Connecting-IP 一致）
  headers.delete("CF-Connecting-IP");
  try {
    const realIp = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Real-IP");
    if (realIp) headers.set("CF-Connecting-IP", realIp);
  } catch { /* ignore */ }

  // 构造转发请求
  const init = {
    method: request.method,
    headers,
    redirect: "manual"
  };
  // GET/HEAD 不能带 body
  if (!["GET", "HEAD"].includes(request.method)) {
    init.body = request.body;
  }

  let resp;
  try {
    resp = await fetch(targetUrl, init);
  } catch (e) {
    return new Response(JSON.stringify({
      error: "上游 Worker 不可达: " + (e.message || e.toString())
    }), {
      status: 502,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }

  // 回传响应，统一加 CORS 头
  const newHeaders = new Headers(resp.headers);
  newHeaders.set("Access-Control-Allow-Origin", "*");
  // 移除可能引发浏览器安全策略的回源头
  newHeaders.delete("X-Frame-Options");

  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers: newHeaders
  });
}
