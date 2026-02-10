#!/usr/bin/env python3
"""
Simple HTTP server for DuckDB WASM IDE
Usage: python server.py [port]
"""

import http.server
import socketserver
import os
import sys
from pathlib import Path

PORT = 8000
DIRECTORY = Path(__file__).parent

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Add CORS headers for WASM support
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        super().end_headers()

def run_server(port):
    with socketserver.TCPServer(("", port), MyHTTPRequestHandler) as httpd:
        print(f"🦆 DuckDB WASM IDE")
        print(f"Server running at: http://localhost:{port}")
        print(f"Press Ctrl+C to stop the server")
        print()
        httpd.serve_forever()

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    try:
        run_server(port)
    except KeyboardInterrupt:
        print("\nServer stopped.")
