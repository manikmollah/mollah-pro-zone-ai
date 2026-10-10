/* Mollah Pro Zone Ai — Developer AI Studio
   BYO-key architecture: the Gemini API key lives ONLY in the user's
   browser localStorage. It is never baked into the code or repo. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const chat = $("chat"), input = $("input"), sendBtn = $("send"),
        apiKeyInput = $("apiKey"), modelSelect = $("modelSelect"),
        statusEl = $("status"), statusText = $("statusText"),
        modelHint = $("modelHint");

  const LS_KEY = "mpz_gemini_key";
  const LS_MODEL = "mpz_gemini_model";
  let mode = "code";
  let history = []; // {role, text}
  let dirHandle = null;

  const SYSTEM = {
    code: "You are Mollah Pro Zone Ai, an elite senior software engineer and coding mentor. " +
      "Write clean, production-quality code with best practices. When asked to build something, " +
      "produce complete, working code — split into logical files using markdown code fences with " +
      "filenames like ```html:index.html. Explain briefly, then show code. Always handle errors, " +
      "keep it modern, and prefer concise explanations followed by excellent code.",
    chat: "You are Mollah Pro Zone Ai, a helpful, sharp AI assistant. Answer clearly and concisely.",
    image: "You are Mollah Pro Zone Ai image director. Describe the image to generate in vivid detail."
  };

  // Preferred models: strongest coding models first (auto-detected from API list)
  const PREFERRED = [
    /gemini-4.*pro/i, /gemini-3\.8.*flash/i, /gemini-3\.7.*flash/i,
    /gemini-3\.5.*flash/i, /gemini-2\.5-pro/i, /gemini-2\.5-flash/i,
    /gemini-2\.0-flash/i, /gemini-1\.5-pro/i
  ];
  const IMAGE_MODELS = ["gemini-2.0-flash-preview-image-generation", "gemini-2.0-flash-exp-image-generation"];

  function getKey() { return (apiKeyInput.value || localStorage.getItem(LS_KEY) || "").trim(); }
  function setStatus(busy, text) {
    statusEl.classList.toggle("busy", !!busy);
    statusText.textContent = text;
  }

  // ---------- API key ----------
  apiKeyInput.value = localStorage.getItem(LS_KEY) || "";
  $("saveKey").onclick = () => {
    const k = apiKeyInput.value.trim();
    if (!k) return toast("Paste a key first");
    localStorage.setItem(LS_KEY, k);
    toast("Key saved in this browser only ✅");
    loadModels();
  };
  $("clearKey").onclick = () => {
    localStorage.removeItem(LS_KEY); apiKeyInput.value = "";
    toast("Key cleared");
  };

  // ---------- Modes ----------
  document.querySelectorAll(".mode").forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll(".mode").forEach((x) => x.classList.remove("active"));
      b.classList.add("active"); mode = b.dataset.mode;
    };
  });
  document.querySelectorAll(".chip").forEach((c) => {
    c.onclick = () => { input.value = c.dataset.prompt; input.focus(); };
  });
  $("menuBtn").onclick = () => $("sidebar").classList.toggle("open");

  // ---------- Models ----------
  async function loadModels() {
    const key = getKey();
    if (!key) { modelSelect.innerHTML = "<option>Add your API key first</option>"; return; }
    modelSelect.innerHTML = "<option>Loading models…</option>";
    try {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?key=" + encodeURIComponent(key));
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      const models = (data.models || []).filter((m) =>
        (m.supportedGenerationMethods || []).includes("generateContent"));
      if (!models.length) throw new Error("No models found");
      // rank by preference
      const rank = (name) => {
        for (let i = 0; i < PREFERRED.length; i++) if (PREFERRED[i].test(name)) return i;
        return 99;
      };
      models.sort((a, b) => rank(a.name) - rank(b.name));
      modelSelect.innerHTML = "";
      models.forEach((m) => {
        const o = document.createElement("option");
        o.value = m.name.replace("models/", "");
        o.textContent = m.displayName || o.value;
        modelSelect.appendChild(o);
      });
      const saved = localStorage.getItem(LS_MODEL);
      const best = models[0].name.replace("models/", "");
      modelSelect.value = saved && [...modelSelect.options].some((o) => o.value === saved) ? saved : best;
      localStorage.setItem(LS_MODEL, modelSelect.value);
      modelHint.textContent = "Auto-selected strongest: " + modelSelect.selectedOptions[0].textContent;
    } catch (e) {
      modelSelect.innerHTML = "<option>Could not load — check key</option>";
      modelHint.textContent = "Model list failed. Your key may be invalid or restricted.";
    }
  }
  modelSelect.onchange = () => localStorage.setItem(LS_MODEL, modelSelect.value);
  $("refreshModels").onclick = loadModels;

  // ---------- Chat ----------
  function addMsg(role, html) {
    document.querySelector(".welcome")?.remove();
    const div = document.createElement("div");
    div.className = "msg " + role;
    div.innerHTML = `<div class="avatar">${role === "user" ? "🧑" : "⚡"}</div><div class="bubble">${html}</div>`;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    return div.querySelector(".bubble");
  }
  function toast(msg) {
    const b = addMsg("ai", `<p>${escapeHtml(msg)}</p>`);
    setTimeout(() => b.parentElement.remove(), 2600);
  }
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Minimal markdown-ish renderer with code blocks + copy/save buttons
  function renderMarkdown(text) {
    const blocks = [];
    let html = escapeHtml(text);
    html = html.replace(/```(\w*)(:?)([^\n]*)\n([\s\S]*?)```/g, (m, lang, colon, fname, code) => {
      const i = blocks.length;
      blocks.push({ lang: lang || "code", fname: fname.trim(), code: code.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&") });
      return `\u0000BLOCK${i}\u0000`;
    });
    html = html
      .replace(/^### (.*)$/gm, "<h3>$1</h3>")
      .replace(/^## (.*)$/gm, "<h2>$1</h2>")
      .replace(/^# (.*)$/gm, "<h1>$1</h1>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code class='inline'>$1</code>")
      .replace(/^\s*[-*] (.*)$/gm, "<li>$1</li>")
      .replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>")
      .replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>");
    html = "<p>" + html + "</p>";
    blocks.forEach((b, i) => {
      const label = b.fname ? `${escapeHtml(b.lang)} · ${escapeHtml(b.fname)}` : escapeHtml(b.lang);
      const codeHtml = `<pre><div class="code-head"><span>${label}</span>` +
        `<span class="code-btns"><button class="mini-btn" data-copy="${i}">⧉ Copy</button>` +
        `<button class="mini-btn" data-save="${i}">⬇ Save</button></span></div>` +
        `<code>${escapeHtml(b.code)}</code></pre>`;
      html = html.replace(`\u0000BLOCK${i}\u0000`, codeHtml);
    });
    window._mpzBlocks = blocks;
    return html;
  }

  chat.addEventListener("click", async (e) => {
    const cp = e.target.dataset?.copy, sv = e.target.dataset?.save;
    const blocks = window._mpzBlocks || [];
    if (cp !== undefined) {
      await navigator.clipboard.writeText(blocks[+cp].code);
      e.target.textContent = "✓ Copied";
      setTimeout(() => (e.target.textContent = "⧉ Copy"), 1500);
    }
    if (sv !== undefined) {
      saveOneFile(blocks[+sv]);
    }
  });

  async function saveOneFile(b) {
    try {
      const name = b.fname || ("snippet-" + Date.now() + ".txt");
      if (window.showSaveFilePicker) {
        const h = await window.showSaveFilePicker({ suggestedName: name });
        const w = await h.createWritable();
        await w.write(b.code); await w.close();
        toast("Saved " + name + " ✅");
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([b.code], { type: "text/plain" }));
        a.download = name; a.click();
      }
    } catch (e) { /* user cancelled */ }
  }

  $("saveProject").onclick = async () => {
    const blocks = window._mpzBlocks || [];
    if (!blocks.length) return toast("No code in chat yet — ask for a project first");
    try {
      if (window.showDirectoryPicker) {
        dirHandle = await window.showDirectoryPicker();
        let n = 0;
        for (const b of blocks) {
          const name = (b.fname || `file-${++n}.${extFor(b.lang)}`).replace(/[<>:"/\\|?*]/g, "_");
          const fh = await dirHandle.getFileHandle(name, { create: true });
          const w = await fh.createWritable();
          await w.write(b.code); await w.close(); n++;
        }
        toast(`Saved ${blocks.length} file(s) to your chosen folder ✅`);
      } else {
        // fallback: download each
        for (const b of blocks) saveOneFile(b);
      }
    } catch (e) { /* cancelled */ }
  };
  function extFor(lang) {
    const m = { html: "html", css: "css", javascript: "js", js: "js", python: "py", java: "java", cpp: "cpp", c: "c", go: "go", rust: "rs", php: "php", ruby: "rb", typescript: "ts", ts: "ts", json: "json", sql: "sql", sh: "sh", bash: "sh" };
    return m[(lang || "").toLowerCase()] || "txt";
  }

  $("newChat").onclick = () => { history = []; chat.innerHTML = ""; location.reload(); };

  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  // Retry on overload (503/429) with backoff, then fall back to lighter Flash models
  async function callGemini(prompt, imageMode) {
    const key = getKey();
    if (!key) throw new Error("NO_KEY");
    const primary = imageMode ? IMAGE_MODELS[0] : modelSelect.value;
    const chain = imageMode ? [primary] : [...new Set([primary, "gemini-2.0-flash", "gemini-2.5-flash"])];
    let lastErr = null;
    for (const model of chain) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const data = await tryModel(key, model, prompt, imageMode);
          return { data, fallback: model !== primary, model };
        } catch (e) {
          lastErr = e;
          if (!/503|overload|UNAVAILABLE|429/i.test(e.message || "")) throw e;
          setStatus(true, `Model busy — retrying (${attempt + 1}/3)…`);
          await sleep(2000 * (attempt + 1));
        }
      }
    }
    throw lastErr;
  }

  async function tryModel(key, model, prompt, imageMode) {
    let body;
    if (imageMode) {
      body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] }
      };
    } else {
      body = {
        systemInstruction: { parts: [{ text: SYSTEM[mode] || SYSTEM.code }] },
        contents: [...history.map((h) => ({ role: h.role === "ai" ? "model" : "user", parts: [{ text: h.text }] })),
                   { role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: mode === "code" ? 0.4 : 0.8, maxOutputTokens: 8192 }
      };
    }
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    if (!r.ok) {
      const t = await r.text();
      throw new Error("API error " + r.status + ": " + t.slice(0, 200));
    }
    return r.json();
  }

  function extractText(data) {
    try {
      return data.candidates[0].content.parts.filter((p) => p.text).map((p) => p.text).join("\n");
    } catch { return ""; }
  }
  function extractImage(data) {
    try {
      for (const p of data.candidates[0].content.parts)
        if (p.inlineData?.data) return "data:" + p.inlineData.mimeType + ";base64," + p.inlineData.data;
    } catch { }
    return null;
  }

  async function send() {
    const prompt = input.value.trim();
    if (!prompt) return;
    if (!getKey()) { toast("⚠️ Paste your Gemini API key in the sidebar first"); apiKeyInput.focus(); return; }
    input.value = "";
    addMsg("user", "<p>" + escapeHtml(prompt).replace(/\n/g, "<br>") + "</p>");
    const bubble = addMsg("ai", `<div class="typing"><span></span><span></span><span></span></div>`);
    setStatus(true, "Thinking…");
    try {
      const imageMode = mode === "image";
      const { data, fallback, model: usedModel } = await callGemini(prompt, imageMode);
      const img = extractImage(data);
      const text = extractText(data) || (img ? "" : "No response — try again.");
      bubble.innerHTML = renderMarkdown(text) + (img ? `<img class="gen" src="${img}" alt="Generated image"/>` : "") +
        (fallback ? `<p class="hint">ℹ️ Your selected model was overloaded, so I answered with <b>${escapeHtml(usedModel)}</b> instead.</p>` : "");
      if (!imageMode && text) history.push({ role: "user", text: prompt }, { role: "ai", text });
      if (history.length > 20) history = history.slice(-20);
    } catch (e) {
      const msg = e.message || "";
      if (msg === "NO_KEY") {
        bubble.innerHTML = "<p>⚠️ Add your Gemini API key in the sidebar to start.</p>";
      } else if (/503|overload|UNAVAILABLE/i.test(msg)) {
        bubble.innerHTML = `<p>⚠️ <b>Model is busy right now (503)</b> — Google's servers are temporarily overloaded. This usually clears within a minute or two.</p><p class="hint">Just hit ➤ to retry, or pick a <b>Flash</b> model in the sidebar — they're faster and rarely busy compared to Pro models.</p>`;
      } else {
        bubble.innerHTML = `<p>❌ ${escapeHtml(msg)}</p><p class="hint">Tip: check your key, model access, and billing at Google AI Studio.</p>`;
      }
    }
    setStatus(false, "Ready");
    chat.scrollTop = chat.scrollHeight;
  }

  sendBtn.onclick = send;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });

  loadModels();
})();
