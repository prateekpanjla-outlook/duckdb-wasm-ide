"""Configuration for MCP agent service."""

import os

# Existing Express API (Cloud Run)
CLOUD_RUN_BASE = os.environ.get(
    "CLOUD_RUN_BASE",
    "https://duckdb-ide-frxi6yk4jq-uc.a.run.app"
)
ADMIN_KEY = os.environ.get("ADMIN_KEY", "")

# Gemini API
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"

# Agent settings
MAX_STEPS = 10
CALL_DELAY_SECONDS = 10
MAX_OUTPUT_TOKENS = 8192

# Ensure UTF-8 for Prefab CLI on Windows
os.environ["PYTHONIOENCODING"] = "utf-8"
