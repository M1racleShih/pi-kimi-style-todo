#!/usr/bin/env python3
"""JSON-line bridge to a real POSIX PTY; no third-party Python packages."""
import base64, fcntl, json, os, pty, select, signal, struct, subprocess, sys, termios, threading, time

def interrupted(signum, frame):
    raise KeyboardInterrupt
signal.signal(signal.SIGTERM, interrupted)
master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', int(sys.argv[1]), int(sys.argv[2]), 0, 0))
process = subprocess.Popen(sys.argv[3:], stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
os.close(slave)
lock = threading.Lock()
def emit(value):
    with lock:
        print(json.dumps(value), flush=True)
def read():
    while True:
        try:
            ready, _, _ = select.select([master], [], [], .1)
            if ready:
                data = os.read(master, 65536)
                if not data: break
                emit({'data': base64.b64encode(data).decode()})
            elif process.poll() is not None: break
        except OSError: break
    emit({'exit': process.wait()})
thread = threading.Thread(target=read, daemon=True)
thread.start()
try:
    for line in sys.stdin:
        cmd = json.loads(line)
        if 'input' in cmd: os.write(master, base64.b64decode(cmd['input']))
        elif 'resize' in cmd:
            rows, cols = cmd['resize']
            fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
            os.killpg(process.pid, signal.SIGWINCH)
        elif 'close' in cmd: break
finally:
    if process.poll() is None:
        os.killpg(process.pid, signal.SIGTERM)
        try: process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
    thread.join(timeout=2)
    os.close(master)
