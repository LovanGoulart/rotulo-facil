import asyncio
import os
import sys
from pathlib import Path
from http import HTTPStatus
from threading import Lock
from wsgiref.util import request_uri

import httpx

sys.path.insert(0, "/home/RotuloFacil/rotulo-facil")
from main import app

settings = Path.home() / ".config/rotulo-facil/openai.env"
if settings.is_file():
    for line in settings.read_text(encoding="utf-8").splitlines():
        name, _, value = line.partition("=")
        if name == "OPENAI_API_KEY" and value.strip():
            os.environ.setdefault(name, value.strip())


loop = asyncio.new_event_loop()
lock = Lock()
client = None
lifespan = None

async def enviar(method, url, headers, body):
    global client, lifespan
    if client is None:
        lifespan = app.router.lifespan_context(app)
        await lifespan.__aenter__()
        client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app))
    return await client.request(method, url, headers=headers, content=body)

def application(environ, start_response):
    size = int(environ.get("CONTENT_LENGTH") or 0)
    if size < 0 or size > 3 * 1024 * 1024:
        start_response("413 Payload Too Large", [("Content-Type", "application/json")])
        return [b'{"detail":"A foto excedeu o limite de 3 MB."}']
    body = environ["wsgi.input"].read(size) if size else b""
    headers = {"Content-Type": environ.get("CONTENT_TYPE") or "application/octet-stream"}
    with lock:
        response = loop.run_until_complete(enviar(
            environ["REQUEST_METHOD"], request_uri(environ), headers, body
        ))
    status = response.status_code
    start_response(f"{status} {HTTPStatus(status).phrase}", response.headers.multi_items())
    return [response.content]



