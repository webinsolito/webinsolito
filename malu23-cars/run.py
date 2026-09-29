import os
import threading
import time
import webbrowser

import uvicorn

if __name__ == "__main__":
    host = os.environ.get("AUTOSALONE_HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", os.environ.get("AUTOSALONE_PORT", "8765")))
    browser_host = "127.0.0.1" if host in {"0.0.0.0", "::"} else host

    def open_browser():
        time.sleep(1.2)
        webbrowser.open(f"http://{browser_host}:{port}")

    threading.Thread(target=open_browser, daemon=True).start()
    uvicorn.run("app.main:app", host=host, port=port, reload=False, access_log=False)
