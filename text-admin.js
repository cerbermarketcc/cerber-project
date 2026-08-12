const loginPanel = document.querySelector("[data-login]");
const editorPanel = document.querySelector("[data-editor]");
const loginForm = document.querySelector("[data-login-form]");
const fields = document.querySelector("[data-fields]");
const languageSelect = document.querySelector("[data-language]");
const searchInput = document.querySelector("[data-search]");
const saveButton = document.querySelector("[data-save]");
const statusLine = document.querySelector("[data-status]");
const PRIMARY_API_ORIGIN = "https://cerber.vip";
const LOCAL_API_HOSTS = ["127.0.0.1", "localhost"];
const API_ORIGIN = location.protocol === "file:" ? PRIMARY_API_ORIGIN : location.origin;

let adminToken = sessionStorage.getItem("cerber_text_admin_token") || "";
let baseTexts = {};
let savedTexts = {};

function setStatus(message) {
  statusLine.textContent = message || "";
}

function extractTextObject(source) {
  const start = source.indexOf("const text = ");
  if (start < 0) throw new Error("Text dictionary not found");
  const open = source.indexOf("{", start);
  let depth = 0;
  let inString = "";
  let escaped = false;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === inString) inString = "";
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      inString = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return source.slice(open, index + 1);
  }
  throw new Error("Text dictionary is incomplete");
}

async function loadTexts() {
  const [appSource, cmsResponse] = await Promise.all([
    fetch(`/app.js?v=${Date.now()}`).then((response) => response.text()),
    fetch(`${API_ORIGIN}/api/cms-texts`).then((response) => response.json()).catch(() => ({ texts: {} }))
  ]);
  baseTexts = Function(`"use strict"; return (${extractTextObject(appSource)});`)();
  savedTexts = cmsResponse.texts || {};
}

function currentLang() {
  return languageSelect.value;
}

function renderFields() {
  const lang = currentLang();
  const query = searchInput.value.trim().toLowerCase();
  const entries = Object.entries(baseTexts[lang] || {}).filter(([key, value]) => {
    const haystack = `${key} ${value} ${savedTexts[lang]?.[key] || ""}`.toLowerCase();
    return !query || haystack.includes(query);
  });

  fields.innerHTML = entries.map(([key, value]) => `
    <label class="text-row">
      <strong>${escapeHtml(key)}</strong>
      <textarea data-key="${escapeHtml(key)}">${escapeHtml(savedTexts[lang]?.[key] ?? value)}</textarea>
    </label>
  `).join("");
  setStatus(`Показано полей: ${entries.length}`);
}

function collectTexts() {
  const lang = currentLang();
  savedTexts[lang] = savedTexts[lang] || {};
  fields.querySelectorAll("[data-key]").forEach((input) => {
    const key = input.dataset.key;
    const value = input.value;
    if (value === baseTexts[lang]?.[key]) delete savedTexts[lang][key];
    else savedTexts[lang][key] = value;
  });
  Object.keys(savedTexts).forEach((key) => {
    if (savedTexts[key] && typeof savedTexts[key] === "object" && !Object.keys(savedTexts[key]).length) {
      delete savedTexts[key];
    }
  });
}

async function saveTexts() {
  collectTexts();
  saveButton.disabled = true;
  setStatus("Сохраняю...");
  try {
    const response = await fetch(`${API_ORIGIN}/api/cms-texts`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({ texts: savedTexts })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Save failed");
    savedTexts = payload.texts || {};
    setStatus("Сохранено. Обновите сайт, чтобы увидеть новые тексты.");
  } catch (error) {
    if (/session|required|unauthorized/i.test(String(error.message || ""))) {
      sessionStorage.removeItem("cerber_text_admin_token");
      adminToken = "";
      loginPanel.hidden = false;
      editorPanel.hidden = true;
    }
    setStatus(error.message || "Не удалось сохранить");
  } finally {
    saveButton.disabled = false;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}

async function openEditor() {
  loginPanel.hidden = true;
  editorPanel.hidden = false;
  setStatus("Загружаю тексты...");
  await loadTexts();
  renderFields();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(loginForm);
  const response = await fetch(`${API_ORIGIN}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: form.get("login"), password: form.get("password"), totp: form.get("totp") })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.token) {
    loginPanel.querySelector("h2").textContent = payload.error || "Не удалось войти";
    return;
  }
  adminToken = payload.token;
  sessionStorage.setItem("cerber_text_admin_token", adminToken);
  await openEditor();
});

languageSelect.addEventListener("change", () => {
  collectTexts();
  renderFields();
});
searchInput.addEventListener("input", () => {
  collectTexts();
  renderFields();
});
saveButton.addEventListener("click", saveTexts);

if (adminToken) openEditor();
