from __future__ import annotations

from starlette.datastructures import MutableHeaders


class ResponseSecurityMiddleware:
    """Apply privacy-first response headers to every HTTP response.

    RISOLVI responses can contain case facts, reviewer material or original
    documents. They must not be cached by browsers, shared proxies or intermediary
    caches. This is implemented as pure ASGI middleware so generated CORS and
    handled error responses receive the same policy as normal endpoint responses.
    """

    def __init__(self, app, *, production: bool = False):
        self.app = app
        self.production = production

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_security_headers(message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers["Cache-Control"] = "no-store, max-age=0"
                headers["Pragma"] = "no-cache"
                headers["Expires"] = "0"
                headers["X-Content-Type-Options"] = "nosniff"
                headers["Referrer-Policy"] = "no-referrer"
                headers["X-Frame-Options"] = "DENY"
                headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
                if self.production:
                    headers["Strict-Transport-Security"] = "max-age=31536000"
            await send(message)

        await self.app(scope, receive, send_with_security_headers)
