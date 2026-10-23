"""One-off screenshot conversion; preview by default, apply only with a backup."""

import argparse
import hashlib
import json
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

from PIL import Image
from sqlalchemy import select

from app.core.screenshots import MAX_SCREENSHOT_EDGE, optimize_screenshot
from app.core.storage import get_image_store
from app.db.session import SessionLocal
from app.models.project import Project
from app.models.resume import Profile


def convert(*, apply: bool, backup_dir: Path | None) -> None:
    if apply and backup_dir is None:
        raise ValueError("--apply requires --backup-dir")
    store = get_image_store()
    replacements: list[str] = []
    originals: list[str] = []
    manifest: list[dict] = []
    committed = False
    before = after = 0
    try:
        with SessionLocal.begin() as session:
            query = select(Project).where(Project.screenshot_filename.is_not(None))
            if apply:
                query = query.with_for_update()
                assert backup_dir is not None
                backup_dir.mkdir(parents=True, exist_ok=False, mode=0o700)
            for project in session.scalars(query):
                old_name = project.screenshot_filename
                assert old_name is not None
                data = store.read(old_name)
                with Image.open(BytesIO(data)) as source:
                    if source.format == "WEBP" and max(source.size) <= MAX_SCREENSHOT_EDGE:
                        continue
                thumbnail = optimize_screenshot(data)
                before += len(data)
                after += len(thumbnail)
                if apply:
                    assert backup_dir is not None
                    backup = backup_dir / old_name
                    backup.write_bytes(data)
                    digest = hashlib.sha256(data).hexdigest()
                    if hashlib.sha256(backup.read_bytes()).hexdigest() != digest:
                        raise OSError("Backup verification failed")
                    entry = {
                        "project_id": project.id,
                        "slug": project.slug,
                        "filename": old_name,
                        "content_type": project.screenshot_content_type,
                        "updated_at": project.screenshot_updated_at.isoformat()
                        if project.screenshot_updated_at
                        else None,
                        "sha256": digest,
                    }
                    manifest.append(entry)
                    # Persist recovery metadata before changing the database.
                    (backup_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
                    new_name = store.save(thumbnail, "image/webp")
                    replacements.append(new_name)
                    originals.append(old_name)
                    entry["replacement_filename"] = new_name
                    (backup_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
                    project.screenshot_filename = new_name
                    project.screenshot_content_type = "image/webp"
                    project.screenshot_updated_at = datetime.now(timezone.utc)
                print(f"{project.slug}: {len(data):,} -> {len(thumbnail):,} bytes")
        committed = True
    finally:
        if not committed:
            for filename in replacements:
                store.delete(filename)
    if apply:
        # Retain any old image also referenced by a profile or another project.
        with SessionLocal() as session:
            referenced = set(session.scalars(select(Project.screenshot_filename)))
            for avatar, banner in session.execute(
                select(Profile.avatar_filename, Profile.banner_filename)
            ):
                referenced.update((avatar, banner))
        for filename in set(originals) - referenced:
            store.delete(filename)
    print(f"{'Applied' if apply else 'Preview'}: {before:,} -> {after:,} bytes")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--backup-dir", type=Path)
    args = parser.parse_args()
    if args.apply and args.backup_dir is None:
        parser.error("--apply requires --backup-dir")
    try:
        convert(apply=args.apply, backup_dir=args.backup_dir)
    except Exception as exc:
        # Connection exceptions can contain credentials; never print their value.
        parser.exit(
            1, f"Conversion failed ({type(exc).__name__}); inspect the backup before retrying.\n"
        )


if __name__ == "__main__":
    main()
