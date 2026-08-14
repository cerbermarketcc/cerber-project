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

async function loadTexts() {
  const [baseResponse, cmsResponse] = await Promise.all([
    fetch(`${API_ORIGIN}/api/cms-base-texts`).then((response) => response.json()),
    fetch(`${API_ORIGIN}/api/cms-texts`).then((response) => response.json()).catch(() => ({ texts: {} }))
  ]);
  baseTexts = baseResponse.texts || {};
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

async function adminAuthRequest(path, options = {}) {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Не удалось подтвердить вход");
  return payload;
}

async function finishAdminAuth(payload) {
  if (!payload?.token) throw new Error("Административная сессия не создана");
  adminToken = payload.token;
  sessionStorage.setItem("cerber_text_admin_token", adminToken);
  await openEditor();
}

function renderRecoveryCodes(payload) {
  const recoveryCodes = Array.isArray(payload?.recoveryCodes) ? payload.recoveryCodes : [];
  loginPanel.innerHTML = `
    <h2>Резервные коды</h2>
    <p class="auth-note">Сохраните эти одноразовые коды сейчас. После перехода в редактор они больше не будут показаны.</p>
    <div class="recovery-codes">${recoveryCodes.map((code) => `<code>${escapeHtml(code)}</code>`).join("")}</div>
    <button type="button" data-recovery-continue>Открыть редактор</button>
  `;
  loginPanel.querySelector("[data-recovery-continue]").addEventListener("click", () => {
    finishAdminAuth(payload).catch((error) => {
      loginPanel.querySelector("h2").textContent = error.message;
    });
  });
}

async function renderMfaSetup(challengeToken, account, message = "") {
  const setup = await adminAuthRequest("/api/admin/2fa/setup", {
    method: "POST",
    headers: { Authorization: `Bearer ${challengeToken}` },
    body: JSON.stringify({ challengeToken })
  });
  loginPanel.innerHTML = `
    <h2>Настройка двухфакторной аутентификации</h2>
    <p class="auth-note">Добавьте ${escapeHtml(account?.login || "администратора")} в Google Authenticator, Microsoft Authenticator, Aegis или другое TOTP-приложение.</p>
    ${message ? `<p class="auth-note">${escapeHtml(message)}</p>` : ""}
    <img class="mfa-qr" src="${escapeHtml(setup.qrCodeDataUrl)}" alt="QR-код для Authenticator">
    <form class="mfa-form" data-mfa-setup-form>
      <label>Секрет для ручного ввода<input value="${escapeHtml(setup.secret)}" readonly></label>
      <label>Текущий 6-значный код<input name="totp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label>
      <button type="submit">Включить 2FA</button>
    </form>
  `;
  loginPanel.querySelector("[data-mfa-setup-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const confirmed = await adminAuthRequest("/api/admin/2fa/confirm", {
        method: "POST",
        headers: { Authorization: `Bearer ${challengeToken}` },
        body: JSON.stringify({ challengeToken, totp: form.get("totp") })
      });
      renderRecoveryCodes(confirmed);
    } catch (error) {
      await renderMfaSetup(challengeToken, account, error.message);
    }
  });
}

function renderMfaVerify(challengeToken, account, message = "") {
  loginPanel.innerHTML = `
    <h2>Подтверждение входа</h2>
    <p class="auth-note">Введите код Authenticator для ${escapeHtml(account?.login || "администратора")} или одноразовый recovery-код.</p>
    ${message ? `<p class="auth-note">${escapeHtml(message)}</p>` : ""}
    <form class="mfa-form" data-mfa-verify-form>
      <label>Код 2FA или recovery-код<input name="factor" autocomplete="one-time-code" maxlength="20" required></label>
      <button type="submit">Подтвердить</button>
    </form>
  `;
  loginPanel.querySelector("[data-mfa-verify-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const factor = String(new FormData(event.currentTarget).get("factor") || "").trim();
    try {
      const payload = await adminAuthRequest("/api/admin/2fa/verify", {
        method: "POST",
        headers: { Authorization: `Bearer ${challengeToken}` },
        body: JSON.stringify({
          challengeToken,
          ...(factor.replace(/\D/g, "").length === 6 ? { totp: factor } : { recoveryCode: factor })
        })
      });
      await finishAdminAuth(payload);
    } catch (error) {
      renderMfaVerify(challengeToken, account, error.message);
    }
  });
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(loginForm);
  try {
    const payload = await adminAuthRequest("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ login: form.get("login"), password: form.get("password") })
    });
    if (payload.requiresMfaSetup) return renderMfaSetup(payload.challengeToken, payload.admin);
    if (payload.requiresMfa) return renderMfaVerify(payload.challengeToken, payload.admin);
    await finishAdminAuth(payload);
  } catch (error) {
    loginPanel.querySelector("h2").textContent = error.message || "Не удалось войти";
  }
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
