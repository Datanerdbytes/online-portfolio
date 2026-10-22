from pydantic import BaseModel


class RootResponse(BaseModel):
    """Pointer to the useful entry points of a running deployment."""

    service: str
    version: str
    docs: str
    health: str
    web: str
