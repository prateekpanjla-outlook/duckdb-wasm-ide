"""HTTP client that proxies tool calls to the existing Express API on Cloud Run."""

import httpx
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import CLOUD_RUN_BASE, ADMIN_KEY


class ApiClient:
    """Calls the /api/admin/tools/* endpoints on the Express Cloud Run service."""

    def __init__(self, base_url: str = None, admin_key: str = None):
        self.base = base_url or CLOUD_RUN_BASE
        self.admin_key = admin_key or ADMIN_KEY

    @property
    def headers(self) -> dict:
        return {
            "Content-Type": "application/json",
            "X-Admin-Key": self.admin_key,
        }

    async def get_coverage_gaps(self) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.base}/api/admin/tools/coverage-gaps",
                headers=self.headers, timeout=30,
            )
            resp.raise_for_status()
            return resp.json()

    async def list_existing_questions(self) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.base}/api/admin/tools/questions",
                headers=self.headers, timeout=30,
            )
            resp.raise_for_status()
            return resp.json()

    async def list_concepts(self) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.base}/api/admin/tools/concepts",
                headers=self.headers, timeout=30,
            )
            resp.raise_for_status()
            return resp.json()

    async def validate_question(self, sql_data: str, sql_solution: str) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.base}/api/admin/tools/validate",
                headers=self.headers, timeout=30,
                json={"sql_data": sql_data, "sql_solution": sql_solution},
            )
            resp.raise_for_status()
            return resp.json()

    async def execute_sql(self, sql: str) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.base}/api/admin/tools/execute-sql",
                headers=self.headers, timeout=30,
                json={"sql": sql},
            )
            resp.raise_for_status()
            return resp.json()

    async def check_concept_overlap(self, concepts: list) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.base}/api/admin/tools/concept-overlap",
                headers=self.headers, timeout=30,
                json={"concepts": concepts},
            )
            resp.raise_for_status()
            return resp.json()

    async def insert_question(self, params: dict) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.base}/api/admin/tools/insert",
                headers=self.headers, timeout=30,
                json=params,
            )
            resp.raise_for_status()
            return resp.json()

    async def generate_test(self, question_id: int, sql_solution: str, question_text: str) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.base}/api/admin/tools/generate-test",
                headers=self.headers, timeout=30,
                json={
                    "question_id": question_id,
                    "sql_solution": sql_solution,
                    "question_text": question_text,
                },
            )
            resp.raise_for_status()
            return resp.json()
