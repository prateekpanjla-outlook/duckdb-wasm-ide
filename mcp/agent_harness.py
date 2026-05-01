"""Agent harness — Gemini + MCP tool dispatch.

Runs the question authoring agent loop:
  1. Send prompt + history to Gemini
  2. Gemini returns functionCall(s)
  3. Call MCP tool(s) → get result
  4. Feed result back to Gemini
  5. Repeat until text answer or max steps

Adapted from c:\\tmp\\test_gemini.py with real MCP tool calls
instead of mock responses.

Usage:
  GEMINI_API_KEY=xxx ADMIN_KEY=yyy python agent_harness.py --prompt "Add a question about CTE"
"""

import argparse
import asyncio
import json
import os
import sys
import time

import httpx

# Add parent to path for config
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import (
    GEMINI_API_KEY, GEMINI_MODEL, GEMINI_BASE_URL,
    MAX_STEPS, CALL_DELAY_SECONDS, MAX_OUTPUT_TOKENS,
)

# Import MCP tool functions directly (no stdio/HTTP — same process)
from mcp_server import (
    get_coverage_gaps,
    list_existing_questions,
    list_concepts,
    validate_question,
    execute_sql,
    check_concept_overlap,
    insert_question,
    generate_test,
)

# Map tool names to functions
TOOL_FUNCTIONS = {
    "get_coverage_gaps": get_coverage_gaps,
    "list_existing_questions": list_existing_questions,
    "list_concepts": list_concepts,
    "validate_question": validate_question,
    "execute_sql": execute_sql,
    "check_concept_overlap": check_concept_overlap,
    "insert_question": insert_question,
    "generate_test": generate_test,
}

# ── System Prompt (ported from agent.js + FK instructions) ───────────
SYSTEM_PROMPT = """You are a Question Authoring Agent for a SQL practice platform that uses DuckDB (PostgreSQL-compatible syntax).

Your job is to generate new SQL practice questions based on admin requests.

WORKFLOW:
1. First, call get_coverage_gaps to see which SQL concepts have no questions yet
2. Call list_existing_questions to find the next order_index and see existing topics
3. Generate a complete question targeting the requested concept
4. Call validate_question to verify the SQL is correct and the solution is distinguishable
5. If validation fails, fix the issue and re-validate
6. Call check_concept_overlap with the concepts your question covers, so the admin can see if any overlap with existing questions
7. Present the complete question as a JSON preview for admin approval
8. Do NOT call insert_question unless the admin explicitly says to insert
9. Complete steps 1-7 autonomously in a single session. Do not pause to ask for confirmation between steps — the admin will review the final preview.

CONCEPT TAXONOMY:
The platform maintains a taxonomy of ~35 SQL concepts (e.g. WHERE, GROUP BY, HAVING, INNER JOIN, RANK, CTE).
Each question is tagged with which concepts it covers (intended vs alternative solutions).
Use get_coverage_gaps to find untaught concepts. Use list_concepts for full coverage details.
When generating a question, include a "concepts" field listing which concepts it covers.

RULES:
- sql_data must use PostgreSQL-compatible SQL
- IMPORTANT: Do NOT reuse table names from existing questions. list_existing_questions returns used_table_names — pick different names.
- Use realistic data (real-sounding names, reasonable numbers)
- sql_solution_explanation must be an array of strings, each explaining one part of the query
- Difficulty levels: beginner (SELECT/WHERE), intermediate (JOIN/GROUP BY/HAVING), advanced (window functions/subqueries/CTEs)
- Category should describe the main SQL concept tested
- Create 8-15 rows of sample data
- The solution must produce results clearly different from SELECT * (distinguishable)
- When generating questions with multiple tables, ALWAYS declare explicit FOREIGN KEY REFERENCES in the CREATE TABLE statements. Example: "merchant_id INTEGER REFERENCES merchants(merchant_id)" — never leave foreign keys as bare INTEGER columns

ER DIAGRAMS:
- For questions with 2+ tables that have foreign key relationships, generate a Mermaid erDiagram string in the "er_diagram" field
- The er_diagram must be raw Mermaid code starting with "erDiagram" — NO markdown fences, NO backticks
- Include table definitions with column types, PK/FK markers, and relationship lines with meaningful labels
- For single-table questions, set er_diagram to null

IMPORTANT: When presenting the final preview, output it as a JSON code block like:
```json
{
  "sql_data": "...",
  "sql_question": "...",
  "sql_solution": "...",
  "sql_solution_explanation": ["...", "..."],
  "difficulty": "...",
  "category": "...",
  "order_index": N,
  "er_diagram": "erDiagram\n    parent ||--o{ child : \"has\"\n    parent {\n        INTEGER id PK\n    }\n    child {\n        INTEGER id PK\n        INTEGER parent_id FK\n    }",
  "concepts": [
    {"name": "HAVING", "is_intended": true},
    {"name": "GROUP BY", "is_intended": true}
  ]
}
```"""

# ── Tool Declarations for Gemini (same as agent.js) ──────────────────
TOOL_DECLARATIONS = [
    {
        "name": "list_existing_questions",
        "description": "List all existing practice questions with their topics, difficulty levels, and order indices.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "execute_sql",
        "description": "Execute a SQL query to test if it runs correctly.",
        "parameters": {
            "type": "object",
            "properties": {
                "sql": {"type": "string", "description": "SQL statement to execute"},
            },
            "required": ["sql"],
        },
    },
    {
        "name": "validate_question",
        "description": "Run the full validation pipeline for a generated question.",
        "parameters": {
            "type": "object",
            "properties": {
                "sql_data": {"type": "string", "description": "CREATE TABLE and INSERT statements"},
                "sql_solution": {"type": "string", "description": "The correct SQL solution query"},
            },
            "required": ["sql_data", "sql_solution"],
        },
    },
    {
        "name": "insert_question",
        "description": "Insert a validated and approved question into the database.",
        "parameters": {
            "type": "object",
            "properties": {
                "sql_data": {"type": "string"},
                "sql_question": {"type": "string"},
                "sql_solution": {"type": "string"},
                "sql_solution_explanation": {"type": "array", "items": {"type": "string"}},
                "difficulty": {"type": "string", "enum": ["beginner", "intermediate", "advanced"]},
                "category": {"type": "string"},
                "order_index": {"type": "integer"},
                "er_diagram": {"type": "string", "description": "Mermaid erDiagram code for multi-table schemas with FKs. Null for single-table."},
            },
            "required": ["sql_data", "sql_question", "sql_solution", "sql_solution_explanation", "difficulty", "category", "order_index"],
        },
    },
    {
        "name": "generate_test",
        "description": "Generate a Playwright E2E test for a question.",
        "parameters": {
            "type": "object",
            "properties": {
                "question_id": {"type": "integer"},
                "sql_solution": {"type": "string"},
                "question_text": {"type": "string"},
            },
            "required": ["question_id", "sql_solution", "question_text"],
        },
    },
    {
        "name": "list_concepts",
        "description": "List all SQL concepts in the taxonomy with coverage counts.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "get_coverage_gaps",
        "description": "Get SQL concepts with ZERO intended questions — gaps in the curriculum.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "check_concept_overlap",
        "description": "Check if concepts already have existing questions covering them.",
        "parameters": {
            "type": "object",
            "properties": {
                "concepts": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of concept names to check",
                },
            },
            "required": ["concepts"],
        },
    },
]


def call_gemini(messages: list, api_key: str, model: str) -> dict:
    """Make a single Gemini API call."""
    url = f"{GEMINI_BASE_URL}/{model}:generateContent?key={api_key}"
    body = {
        "contents": messages,
        "tools": [{"functionDeclarations": TOOL_DECLARATIONS}],
        "toolConfig": {"functionCallingConfig": {"mode": "AUTO"}},
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": MAX_OUTPUT_TOKENS,
        },
    }
    resp = httpx.post(url, json=body, timeout=60)
    if resp.status_code != 200:
        raise Exception(f"Gemini API {resp.status_code}: {resp.text[:300]}")
    return resp.json()


async def run_agent(prompt: str, api_key: str = None, model: str = None):
    """Run the full agent loop. Yields step dicts for SSE streaming.

    Each yielded step:
    {
        "type": "tool_call" | "tool_result" | "answer" | "error" | "system",
        "tool": str,
        "input": dict,
        "result": dict,
        "content": str,
        "latencyMs": int,
    }
    """
    api_key = api_key or GEMINI_API_KEY
    model = model or GEMINI_MODEL

    if not api_key:
        yield {"type": "error", "content": "GEMINI_API_KEY not configured"}
        return

    messages = [{"role": "user", "parts": [{"text": SYSTEM_PROMPT + "\n\nAdmin request: " + prompt}]}]

    step_count = 0
    tool_calls_made = 0

    while step_count < MAX_STEPS:
        step_count += 1

        # Rate limit
        if step_count > 1:
            yield {"type": "system", "content": f"Waiting {CALL_DELAY_SECONDS}s before next Gemini call..."}
            await asyncio.sleep(CALL_DELAY_SECONDS)

        print(f"-- Gemini call #{step_count}: sending {len(messages)} messages --")

        start = time.time()
        try:
            data = call_gemini(messages, api_key, model)
        except Exception as e:
            yield {"type": "error", "content": f"Gemini call failed: {e}", "latencyMs": int((time.time() - start) * 1000)}
            break

        latency_ms = int((time.time() - start) * 1000)

        # Parse response
        candidates = data.get("candidates", [])
        if not candidates or not candidates[0].get("content", {}).get("parts"):
            finish = candidates[0].get("finishReason", "unknown") if candidates else "no candidates"
            yield {"type": "error", "content": f"Empty Gemini response (finishReason: {finish})", "latencyMs": latency_ms}
            break

        parts = candidates[0]["content"]["parts"]
        usage = data.get("usageMetadata", {})
        print(f"   Latency: {latency_ms}ms | Tokens: in={usage.get('promptTokenCount', '?')}, out={usage.get('candidatesTokenCount', '?')}")

        # Preserve full parts in message history (including thoughtSignature)
        messages.append({"role": "model", "parts": parts})

        # Handle ALL tool calls (Gemini 3.x can return multiple in parallel)
        tool_calls = [p for p in parts if "functionCall" in p]
        text_part = next((p for p in parts if p.get("text", "").strip()), None)

        if tool_calls:
            function_responses = []

            for tc in tool_calls:
                fc = tc["functionCall"]
                name = fc["name"]
                args = fc.get("args", {})
                tool_calls_made += 1

                if tc.get("thoughtSignature"):
                    print(f"   Thought signature: {name} ({len(tc['thoughtSignature'])} chars)")

                print(f"   CALL: {name}({json.dumps(args)[:200]})")
                if name == "insert_question":
                    print(f"   er_diagram in args: {'er_diagram' in args}")
                    if 'er_diagram' in args:
                        print(f"   er_diagram value: {str(args['er_diagram'])[:200]}")

                yield {
                    "type": "tool_call",
                    "tool": name,
                    "input": args,
                    "latencyMs": latency_ms,
                }

                # Call MCP tool function directly
                tool_fn = TOOL_FUNCTIONS.get(name)
                if not tool_fn:
                    tool_result = {"error": f"Unknown tool: {name}"}
                else:
                    try:
                        # MCP tools return Prefab Column — we need the underlying data too
                        # For now, call the API client directly to get JSON for Gemini
                        from tools.api_client import ApiClient
                        api_client = ApiClient()

                        if name == "get_coverage_gaps":
                            tool_result = await api_client.get_coverage_gaps()
                        elif name == "list_existing_questions":
                            tool_result = await api_client.list_existing_questions()
                        elif name == "list_concepts":
                            tool_result = await api_client.list_concepts()
                        elif name == "validate_question":
                            tool_result = await api_client.validate_question(args.get("sql_data", ""), args.get("sql_solution", ""))
                        elif name == "execute_sql":
                            tool_result = await api_client.execute_sql(args.get("sql", ""))
                        elif name == "check_concept_overlap":
                            tool_result = await api_client.check_concept_overlap(args.get("concepts", []))
                        elif name == "insert_question":
                            tool_result = await api_client.insert_question(args)
                        elif name == "generate_test":
                            tool_result = await api_client.generate_test(
                                args.get("question_id", 0),
                                args.get("sql_solution", ""),
                                args.get("question_text", ""),
                            )
                        else:
                            tool_result = {"error": f"Unknown tool: {name}"}
                    except Exception as e:
                        tool_result = {"error": str(e)}

                print(f"   RESULT: {json.dumps(tool_result)[:200]}")

                yield {
                    "type": "tool_result",
                    "tool": name,
                    "result": tool_result,
                }

                function_responses.append({
                    "functionResponse": {
                        "name": name,
                        "response": tool_result,
                    }
                })

            if len(tool_calls) > 1:
                print(f"   ({len(tool_calls)} parallel tool calls dispatched)")

            # Send ALL tool results in a single user message
            messages.append({"role": "user", "parts": function_responses})
            continue

        if text_part:
            text = text_part["text"]
            print(f"   TEXT ({len(text)} chars):\n{text[:1000]}")

            # Nudge if no tools used yet
            if tool_calls_made == 0 and step_count < MAX_STEPS:
                print("   Nudging Gemini to use tools...")
                yield {"type": "system", "content": "Retrying -- agent skipped tools"}
                messages.append({
                    "role": "user",
                    "parts": [{"text": "You MUST use the available tools before responding. Start by calling get_coverage_gaps, then list_existing_questions."}],
                })
                continue

            yield {
                "type": "answer",
                "content": text,
                "latencyMs": latency_ms,
            }
            break

        # Unexpected response
        print(f"   Unexpected: {[list(p.keys()) for p in parts]}")
        yield {"type": "error", "content": "Unexpected Gemini response", "latencyMs": latency_ms}
        break

    if step_count >= MAX_STEPS:
        yield {"type": "error", "content": "Agent reached maximum step limit"}

    print(f"== Agent complete: {step_count} steps, {tool_calls_made} tool calls ==")


async def main():
    parser = argparse.ArgumentParser(description="MCP Question Authoring Agent")
    parser.add_argument("--prompt", default="Add a question about DENSE_RANK() window function")
    parser.add_argument("--model", default=None, help="Override GEMINI_MODEL")
    parser.add_argument("--key", default=None, help="Override GEMINI_API_KEY")
    args = parser.parse_args()

    api_key = args.key or GEMINI_API_KEY
    model = args.model or GEMINI_MODEL

    print(f"\nAgent: model={model}, prompt={args.prompt}\n")

    async for step in run_agent(args.prompt, api_key, model):
        step_type = step.get("type", "")
        if step_type == "tool_call":
            pass  # already printed in run_agent
        elif step_type == "tool_result":
            pass  # already printed
        elif step_type == "answer":
            print(f"\n{'='*60}")
            print("FINAL ANSWER:")
            print(step["content"])
            print(f"{'='*60}\n")
        elif step_type == "error":
            print(f"\nERROR: {step['content']}\n")
        elif step_type == "system":
            print(f"   [{step['content']}]")


if __name__ == "__main__":
    asyncio.run(main())
