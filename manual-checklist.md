# Manual Checklist

Use this after deploying the backend and frontend to all domains.

1. Create a store in the owner admin panel.
2. Open each of the 6 domains and confirm the store appears in `All`.
3. Open the menu catalog page on each domain and confirm the store appears in `Stores`.
4. Mark the store as `TOP 10`, save, and confirm it appears in `All`, `TOP`, and `Stores`.
5. Mark the store as `NEW`, save, and confirm it appears in `All`, `New`, and `Stores` with a new badge.
6. Edit the store profile from shop admin and confirm the store remains visible on all domains.
7. Create a product profile/card from shop admin and confirm the store remains visible.
8. Create a product/position from shop admin and confirm the store remains visible.
9. Stop sales for the store and confirm the card stays visible but is disabled/not clickable.
10. Delete the store from owner/admin panel and confirm it disappears from all domains.
11. On the VIP domain, open DevTools and confirm there are no fatal JS errors, missing JS/CSS assets, failed `/api/state`, or failed `/api/realtime`.
12. On the VIP domain, confirm the page renders the same store list as the other domains.
