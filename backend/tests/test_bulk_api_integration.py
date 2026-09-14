import pytest
import io
import openpyxl
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db.tenant import get_current_user, get_tenant_id

from mongomock_motor import AsyncMongoMockClient
from app.db.connection import db

@pytest.fixture
def override_deps():
    mock_client = AsyncMongoMockClient()
    mock_db = mock_client["test_placement_db"]
    old_db = db.db
    old_client = db.client
    db.db = mock_db
    db.client = mock_client

    async def mock_user():
        return {"user_id": "test_tpo_user_1", "role": "TPO", "institution_id": "inst_gtu_1"}
    async def mock_tenant():
        return "inst_gtu_1"

    app.dependency_overrides[get_current_user] = mock_user
    app.dependency_overrides[get_tenant_id] = mock_tenant
    yield
    app.dependency_overrides.clear()
    db.db = old_db
    db.client = old_client

@pytest.mark.anyio
async def test_download_template_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Test /api/bulk-students/template
        res1 = await client.get("/api/bulk-students/template")
        assert res1.status_code == 200
        assert res1.headers["content-type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        assert len(res1.content) > 1000

        # Test /api/students/import/template
        res2 = await client.get("/api/students/import/template")
        assert res2.status_code == 200
        assert len(res2.content) > 1000

        # Test /api/students/template
        res3 = await client.get("/api/students/template")
        assert res3.status_code == 200
        assert len(res3.content) > 1000

@pytest.mark.anyio
async def test_bulk_preview_and_commit_flow(override_deps):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Download template
        template_res = await client.get("/api/bulk-students/template")
        assert template_res.status_code == 200

        # 2. Preview upload
        files = {
            "file": ("student_upload.xlsx", template_res.content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        }
        preview_res = await client.post("/api/bulk-students/preview", files=files)
        assert preview_res.status_code == 200
        preview_data = preview_res.json()
        assert preview_data["success"] is True
        assert "temp_file_id" in preview_data
        assert "summary" in preview_data
        assert "sample_preview" in preview_data

        temp_file_id = preview_data["temp_file_id"]

        # 3. Commit with temp_file_id
        commit_res = await client.post("/api/bulk-students/commit", json={"temp_file_id": temp_file_id, "override_existing": True})
        assert commit_res.status_code == 200
        commit_data = commit_res.json()
        assert commit_data["success"] is True
        assert commit_data["summary"]["total_rows"] >= 1
