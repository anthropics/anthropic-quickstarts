import os
import socket
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = int(os.environ['PORT_HTTP_INTERNAL'])


class HTTPServerV6(HTTPServer):
    address_family = socket.AF_INET6


def run_server():
    os.chdir(os.path.dirname(__file__) + "/static_content")
    server_address = ("::", PORT)
    httpd = HTTPServerV6(server_address, SimpleHTTPRequestHandler)
    print(f"Starting HTTP server on port {PORT}...")  # noqa: T201
    httpd.serve_forever()


if __name__ == "__main__":
    run_server()
