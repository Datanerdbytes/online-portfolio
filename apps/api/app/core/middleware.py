"""Request-level guards for large uploads.

Starlette spools an uploaded file to disk without an upper bound: the whole body
is written before the route handler can inspect it. A route-level size check
therefore rejects the payload *after* the bytes were already received. This
middleware bounds the number of bytes that reach the parser at all.

The guard is deliberately narrow: it applies to one method and one path, and it
buffers at most `max_bytes` before answering with the API's own error vocabulary.
"""

from __future__ import annotations

import json

from starlette.types import Message, Receive, Scope, Send

# Multipart framing (boundaries and part headers) adds a small overhead on top of
# the file bytes. The allowance is generous but still bounded.
MULTIPART_OVERHEAD_BYTES = 65536


def _json_body(payload: dict[str, str]) -> bytes:
    # Compact separators, so the body is byte-identical to what FastAPI's
    # JSONResponse would produce for the same payload.
    return json.dumps(payload, separators=(",", ":")).encode("utf-8")


class RequestBodyLimitMiddleware:
    """Reject an oversized request body before it reaches the route handler.

    The body is buffered up to `max_bytes` and replayed to the application, so
    the downstream handler still sees a normal request. When the limit is
    exceeded the request is answered with 413 and the body is never replayed.
    """

    def __init__(self, app, *, max_bytes: int, method: str, path: str) -> None:
        self.app = app
        self.max_bytes = max_bytes
        self.method = method.upper()
        self.path = path

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] != "http"
            or scope.get("method") != self.method
            or scope.get("path") != self.path
        ):
            await self.app(scope, receive, send)
            return
        await self._dispatch(scope, receive, send)

    async def _dispatch(self, scope: Scope, receive: Receive, send: Send) -> None:
        declared = self._declared_length(scope)
        if declared is not None and declared > self.max_bytes:
            await self._reject(send)
            return

        chunks: list[bytes] = []
        total = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            total += len(chunk)
            if total > self.max_bytes:
                await self._reject(send)
                return
            chunks.append(chunk)
            if not message.get("more_body", False):
                break

        body = b"".join(chunks)
        delivered = False

        async def replay() -> Message:
            nonlocal delivered
            if delivered:
                return {"type": "http.request", "body": b"", "more_body": False}
            delivered = True
            return {"type": "http.request", "body": body, "more_body": False}

        await self.app(scope, replay, send)

    @staticmethod
    def _declared_length(scope: Scope) -> int | None:
        for key, value in scope.get("headers", []):
            if key.lower() != b"content-length":
                continue
            try:
                return int(value)
            except ValueError:
                return None
        return None

    async def _reject(self, send: Send) -> None:
        body = _json_body({"detail": "Avatar too large"})
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode("ascii")),
                    (b"cache-control", b"no-store"),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})
