import os
import sys
import subprocess
import time
import webbrowser
import threading
import signal

# Get paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

processes = []
shutting_down = False

def print_banner():
    banner = """
============================================================
                     NH STOCK SPREAD
============================================================
[*] System initializing...
[*] Cross-Broker execution engine ready.
============================================================
"""
    print(banner)

def install_python_deps():
    print("[*] Checking Python dependencies...")
    req_file = os.path.join(BACKEND_DIR, "requirements.txt")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", req_file])
        print("[+] Python dependencies satisfied.")
    except Exception as e:
        print(f"[-] Error installing Python dependencies: {e}")
        sys.exit(1)

def install_frontend_deps():
    print("[*] Checking frontend node modules...")
    node_modules = os.path.join(FRONTEND_DIR, "node_modules")
    if not os.path.exists(node_modules):
        print("[*] node_modules not found. Installing packages via npm...")
        try:
            # Use shell=True for windows command execution compatibility
            subprocess.check_call("npm install", shell=True, cwd=FRONTEND_DIR)
            print("[+] Frontend packages installed successfully.")
        except Exception as e:
            print(f"[-] Error installing npm packages: {e}")
            sys.exit(1)
    else:
        print("[+] Frontend packages satisfied.")

def start_backend():
    print("[*] Launching FastAPI backend server on http://127.0.0.1:8000 ...")
    try:
        # Run uvicorn app:app
        proc = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", "8000"],
            cwd=BACKEND_DIR,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
        processes.append(proc)
        
        # Simple thread to echo stdout
        def log_streamer():
            for line in proc.stdout:
                if shutting_down:
                    break
                print(f"[Backend] {line.strip()}", flush=True)
        
        t = threading.Thread(target=log_streamer, daemon=True)
        t.start()
        
    except Exception as e:
        print(f"[-] Failed to start backend: {e}", flush=True)
        sys.exit(1)

def start_frontend():
    print("[*] Launching Vite frontend dev server...", flush=True)
    try:
        proc = subprocess.Popen(
            "npm run dev",
            shell=True,
            cwd=FRONTEND_DIR,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
        processes.append(proc)
        
        # Simple thread to echo stdout
        def log_streamer():
            opened = False
            for line in proc.stdout:
                if shutting_down:
                    break
                print(f"[Frontend] {line.strip()}", flush=True)
                if ("Local:" in line or "5173" in line or "5174" in line) and not opened:
                    opened = True
                    # Wait a bit for server to fully initialize and open browser
                    threading.Timer(1.5, open_browser).start()
        
        t = threading.Thread(target=log_streamer, daemon=True)
        t.start()
        
    except Exception as e:
        print(f"[-] Failed to start frontend: {e}")
        sys.exit(1)

def open_browser():
    url = "http://localhost:5173"
    print(f"[+] Launching browser and navigating to: {url}")
    webbrowser.open(url)

def shutdown_handler(signum, frame):
    global shutting_down
    if shutting_down:
        return
    shutting_down = True
    print("\n[-] Shutting down all terminal services...")
    for proc in processes:
        try:
            # Kill subprocess tree on windows
            if sys.platform == "win32":
                subprocess.call(f"taskkill /F /T /PID {proc.pid}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                proc.terminate()
        except:
            pass
    print("[+] Cleanup complete. Goodbye!")
    sys.exit(0)

if __name__ == "__main__":
    # Register termination signals
    signal.signal(signal.SIGINT, shutdown_handler)
    signal.signal(signal.SIGTERM, shutdown_handler)
    
    print_banner()
    install_python_deps()
    install_frontend_deps()
    
    start_backend()
    
    # Wait for backend startup before launching frontend
    time.sleep(2)
    
    start_frontend()
    
    print("\n[+] System running. Press Ctrl+C to terminate services.\n")
    
    # Keep main thread alive
    while True:
        try:
            time.sleep(1)
        except KeyboardInterrupt:
            shutdown_handler(None, None)
