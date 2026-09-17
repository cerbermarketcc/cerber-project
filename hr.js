let hrLoading = false;
async function refreshHrContact() {
  if (document.hidden || hrLoading) return;
  hrLoading = true;
  try {
    const response = await fetch("/api/hr/contact", { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return;
    const { username } = await response.json();
    if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username)) return;
    document.querySelector("[data-hr-link]").textContent = `@${username}`;
    document.querySelectorAll("[data-hr-link], [data-hr-button]").forEach(link => { link.href = `https://t.me/${username}`; });
  } catch {} finally { hrLoading = false; }
}
refreshHrContact();
setInterval(refreshHrContact, 15000);
document.addEventListener("visibilitychange", refreshHrContact);
