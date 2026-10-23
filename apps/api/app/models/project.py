from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.owner import OwnedContent


class Project(OwnedContent, Base):
    """An illustrative project entry.

    Column and type choices, documented for maintainers:

    - ``id``: generated primary key.
    - ``slug``: ``String(100)``, unique, indexed. URL-safe identifier used for
      lookups and as the idempotency key for the seed command.
    - ``title``: ``String(200)``, required.
    - ``summary``: ``String(1000)``, required.
    - ``technologies``: PostgreSQL ``text[]`` (``ARRAY(String(50))``). A native
      PostgreSQL array keeps the technology list ordered and round-trips through
      psycopg as a plain Python ``list[str]``. It is also queryable with
      PostgreSQL array operators if needed later. A comma-separated string was
      rejected because it is not natively ordered or queryable; JSONB was
      rejected because a plain array is simpler for a list of strings.
    - ``repository_url`` / ``demo_url``: ``String(1024)``, optional (null when
      not supplied).
    - ``display_order``: ``Integer``, required, default 0. Orders entries
      ascending, with ``id`` as a deterministic tiebreaker in queries.
    - ``is_sample``: ``Boolean``, required, default false. Flags clearly
      labeled illustrative placeholder entries that are not real portfolio
      work.
    - ``screenshot_filename`` / ``screenshot_content_type`` /
      ``screenshot_updated_at``: optional metadata for one replaceable
      project screenshot stored beneath ``MEDIA_ROOT``.
    """

    __tablename__ = "projects"
    __table_args__ = (UniqueConstraint("user_id", "slug", name="uq_projects_user_slug"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    summary: Mapped[str] = mapped_column(String(1000), nullable=False)
    technologies: Mapped[list[str]] = mapped_column(
        ARRAY(String(50)),
        nullable=False,
        default=list,
        server_default=text("'{}'::text[]"),
    )
    repository_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    demo_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    display_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    is_sample: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    screenshot_filename: Mapped[str | None] = mapped_column(String(100), nullable=True)
    screenshot_content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    screenshot_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    @property
    def screenshot_url(self) -> str | None:
        if not self.screenshot_filename:
            return None
        return f"/api/v1/projects/{self.slug}/screenshot"
