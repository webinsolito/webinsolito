from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

from .config import Settings
from .db import Database
from .repository import Repository
from .storage import PrivateStorage, build_storage


@dataclass(frozen=True, slots=True)
class SweepResult:
    documents_deleted: int = 0
    cases_deleted: int = 0


def run_retention(
    settings: Settings | None = None,
    database: Database | None = None,
    storage: PrivateStorage | None = None,
    now: datetime | None = None,
) -> SweepResult:
    settings = settings or Settings.from_env()
    database = database or Database(settings.database_url)
    database.create_all()
    storage = storage or build_storage(settings)
    repo = Repository(database, settings.capability_secret)
    now = now or datetime.now(timezone.utc)

    docs_deleted = 0
    for doc in repo.expired_documents(now):
        storage.delete(doc.storage_key)
        repo.delete_document(doc.id)
        docs_deleted += 1

    cases_deleted = 0
    for case in repo.expired_cases(now):
        case_id = UUID(case.id)
        for doc in repo.list_documents(case_id):
            storage.delete(doc.storage_key)
        repo.delete_case(case_id)
        cases_deleted += 1

    return SweepResult(documents_deleted=docs_deleted, cases_deleted=cases_deleted)


if __name__ == "__main__":
    result = run_retention()
    print(f"documents_deleted={result.documents_deleted} cases_deleted={result.cases_deleted}")
