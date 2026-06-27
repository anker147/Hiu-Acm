// HIU-ACM 浏览器指纹采集模块
// 目的：在登录日志中识别用户设备，辅助安全审计
// 采集维度：UA / 平台 / 屏幕 / 时区 / 语言 / Canvas 哈希 / WebGL 厂商
// 所有字段都在客户端计算，不涉及敏感信息；同一设备稳定，不同设备有差异

const Fingerprint = {
  /**
   * 采集浏览器指纹，返回 { fingerprint, detail }
   * - fingerprint: 短哈希字符串（用于展示和去重）
   * - detail: 完整字段对象（用于日志详情）
   */
  async collect() {
    const detail = {};
    try {
      detail.ua = navigator.userAgent || "";
      detail.platform = navigator.platform || "";
      detail.language = navigator.language || "";
      detail.languages = (navigator.languages || []).join(",");
      detail.screen = `${screen.width}x${screen.height}`;
      detail.colorDepth = screen.colorDepth || 0;
      detail.pixelRatio = window.devicePixelRatio || 1;
      detail.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      detail.timezoneOffset = new Date().getTimezoneOffset();
      detail.hardwareConcurrency = navigator.hardwareConcurrency || 0;
      detail.deviceMemory = navigator.deviceMemory || 0;
      detail.touch = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
      detail.cookieEnabled = navigator.cookieEnabled;
      detail.doNotTrack = navigator.doNotTrack || "";
    } catch (e) {
      detail._collectError = String(e);
    }

    // Canvas 指纹：画一段文字+图形，导出 toDataURL，取哈希
    // 同设备稳定，不同设备因字体/抗锯齿/GPU 不同会有差异
    try {
      detail.canvas = this._canvasHash();
    } catch (e) {
      detail.canvas = "err";
    }

    // WebGL 厂商和渲染器（显卡信息）
    try {
      const gl = this._getWebGL();
      if (gl) {
        const dbgInfo = gl.getExtension("WEBGL_debug_renderer_info");
        detail.webglVendor = dbgInfo ? gl.getParameter(dbgInfo.UNMASKED_VENDOR_WEBGL) : "";
        detail.webglRenderer = dbgInfo ? gl.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL) : "";
      }
    } catch (e) {
      detail.webglVendor = "";
      detail.webglRenderer = "";
    }

    // 计算综合指纹哈希（SHA-256 取前 16 位）
    const fingerprint = await this._hash(JSON.stringify(detail));
    return { fingerprint, detail };
  },

  _canvasHash() {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 60;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "no-ctx";
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("HIU-ACM-FP-∂®™", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("HIU-ACM-FP-∂®™", 4, 17);
    return canvas.toDataURL();
  },

  _getWebGL() {
    const canvas = document.createElement("canvas");
    return canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
  },

  async _hash(text) {
    try {
      const buf = new TextEncoder().encode(text);
      const hash = await crypto.subtle.digest("SHA-256", buf);
      return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 16);
    } catch {
      // fallback：简易 hash
      let h = 0;
      for (let i = 0; i < text.length; i++) {
        h = ((h << 5) - h) + text.charCodeAt(i);
        h |= 0;
      }
      return Math.abs(h).toString(16).padStart(8, "0").repeat(2).slice(0, 16);
    }
  }
};
