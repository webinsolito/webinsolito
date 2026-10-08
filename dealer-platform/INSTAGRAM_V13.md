# Instagram V1.3 — publication integrity

This release hardens the existing editorial workflow without claiming automatic Meta publishing.

- READY requires a vehicle, meaningful caption and public HTTPS media URL.
- SCHEDULED additionally requires a future schedule.
- PUBLISHED is treated as a server/Meta-confirmed state and cannot be declared manually in the browser.
- The Instagram dashboard surfaces ready, scheduled, verified published and problematic content.
- New guards remain available offline through the service-worker cache.

Automatic Meta publishing still requires a server-side Meta integration with credentials kept outside the browser.
