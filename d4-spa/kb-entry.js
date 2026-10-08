(function () {
  var KB_API_BASE = window.KB_API_BASE || "";

  function detectBase() {
    if (KB_API_BASE) return Promise.resolve(KB_API_BASE);
    return fetch("/kb-api/health", { cache: "no-store" })
      .then(function (r) {
        return r.ok ? "/kb-api" : "http://127.0.0.1:8898";
      })
      .catch(function () {
        return "http://127.0.0.1:8898";
      });
  }

  function ask(base, query) {
    return fetch(base + "/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: query, top_k: 3 }),
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  RENDER.kb = function () {
    var pg = $("#page-kb");
    pg.innerHTML =
      '<div class="phead"><h2><span class="barline"></span>知识问答</h2>' +
      '<div class="crumb">Dify 检索问答 · 3 库 362 切片 · 引用回源</div></div>' +
      '<div style="max-width:880px;margin:0 auto">' +
        '<div class="ov-panel" style="padding:16px 18px">' +
          '<label style="font-size:13px;font-weight:700;display:block;margin-bottom:8px">输入业务问题</label>' +
          '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
            '<input id="kbQ" type="text" placeholder="例如：投研平台地址在哪里？Steel 补装完成了吗？" ' +
            'style="flex:1;min-width:220px;padding:10px 12px;border-radius:9px;border:1px solid var(--line);' +
            'background:rgba(10,16,34,.55);color:var(--txt);outline:none;font-size:13px"/>' +
            '<button id="kbGo" style="padding:10px 18px;border-radius:9px;border:0;background:var(--cyan);' +
            'color:#04121a;font-weight:700;cursor:pointer">检索提问</button>' +
          '</div>' +
          '<div id="kbHint" style="margin-top:8px;font-size:12px;color:var(--txt-3)">先查再答，答案附引用来源，可点击回源。</div>' +
        '</div>' +
        '<div id="kbResult" style="margin-top:14px"></div>' +
      '</div>';

    var input = $("#kbQ");
    var btn = $("#kbGo");
    var result = $("#kbResult");
    var hint = $("#kbHint");

    function run() {
      var query = input.value.trim();
      if (!query) return;
      btn.disabled = true;
      hint.textContent = "检索中…";
      result.innerHTML = "";
      detectBase()
        .then(function (base) {
          return ask(base, query);
        })
        .then(function (r) {
          hint.textContent = "完成 · 命中 " + r.hit_count + " 条 · 耗时 " + r.duration_ms + "ms";
          var html =
            '<div class="ov-panel" style="padding:16px 18px">' +
            '<div style="white-space:pre-wrap;font-size:13.5px;line-height:1.7">' + esc(r.answer) + "</div>";
          if (r.citations && r.citations.length) {
            html +=
              '<div style="margin-top:14px;border-top:1px solid var(--line);padding-top:12px">' +
              r.citations
                .map(function (c) {
                  var src = c.source_url
                    ? '<a href="' + esc(c.source_url) + '" target="_blank" rel="noopener" style="color:var(--cyan)">回源</a>'
                    : "";
                  return (
                    '<div style="font-size:12.5px;margin:6px 0">引用' + c.idx + " · " +
                    esc(c.dataset_name) + " / " + esc(c.document_name) + " · 相关度 " +
                    (c.score == null ? "—" : c.score.toFixed(3)) + " " + src + "</div>"
                  );
                })
                .join("") +
              "</div>";
          }
          result.innerHTML = html + "</div>";
        })
        .catch(function (e) {
          hint.textContent = "检索失败：" + e.message + "。请确认本地 KB QA 服务已启动（127.0.0.1:8898）。";
        })
        .then(function () {
          btn.disabled = false;
        });
    }

    btn.addEventListener("click", run);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") run();
    });
  };

  if (location.hash === "#kb") renderRoute();
})();
