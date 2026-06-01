import os
import sys
import threading
import time
import uvicorn
import webbrowser
from main import app

def start_server():
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="error")

if __name__ == "__main__":
    # 1. Start Backend in a separate thread
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()

    # 2. Wait a moment for server to start
    time.sleep(1.5)

    # 3. Open Browser in App Mode
    # 'webbrowser' is standard lib. 
    # For a more "GUI-like" feel without address bar, we'd need 'pywebview' or chrome app mode.
    # We will try to launch Chrome in --app mode if possible, else default browser.
    
    url = "http://127.0.0.1:8000"
    
    # Try to find chrome to launch in app mode
    chrome_paths = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Users\%USERNAME%\AppData\Local\Google\Chrome\Application\chrome.exe"
    ]
    
    launched = False
    for path in chrome_paths:
        expanded_path = os.path.expandvars(path)
        if os.path.exists(expanded_path):
            try:
                import subprocess
                subprocess.Popen([expanded_path, f"--app={url}"])
                launched = True
                break
            except:
                continue
    
    if not launched:
        webbrowser.open(url)

    print("MelodyScribe is running. Close the terminal window to exit.")
    
    # Keep main thread alive
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        sys.exit(0)
