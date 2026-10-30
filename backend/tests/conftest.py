import os
import pytest
from app.config import settings
from app.db.connection import db, connect_to_mongo
from mongomock_motor import AsyncMongoMockClient

# Ensure test suite strictly uses in-memory mock client and never touches local/live database
settings.MONGO_URI = "mock"
settings.MONGO_DB = "placementhub_test"
os.environ["MONGO_URI"] = "mock"
os.environ["MONGO_DB"] = "placementhub_test"

@pytest.fixture(autouse=True)
def ensure_mock_database():
    """Ensures tests run strictly in an isolated in-memory MongoMock database."""
    db.client = AsyncMongoMockClient()
    db.db = db.client["placementhub_test"]
    yield

