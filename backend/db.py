from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from config import MONGO_DB_NAME, MONGO_URI

client = AsyncIOMotorClient(MONGO_URI)
db: AsyncIOMotorDatabase = client[MONGO_DB_NAME]


def get_db() -> AsyncIOMotorDatabase:
    return db
