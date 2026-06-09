const fs = require('fs');
const path = 'app.js';
let s = fs.readFileSync(path, 'utf8');
const start = s.indexOf('  document.querySelector("[data-shop-product-form]")?.addEventListener("submit", async (event) => {');
const end = s.indexOf('  document.querySelectorAll("[data-shop-position-delete]")', start);
if (start === -1 || end === -1) {
  console.error('shop product form block not found');
  process.exit(1);
}
const block = `  document.querySelector("[data-shop-product-form]")?.addEventListener("submit", async (event) => {
    event