"""Agent harness — Gemini + MCP client tool dispatch.

Connects to the MCP server as an in-memory client, discovers tools
dynamically via list_tools(), and calls them via MCP protocol.

Flow:
  1. Connect to MCP server → discover tools
  2. Convert MCP tool schemas → Gemini functionDeclarations
  3. Send prompt + history to Gemini
  4. Gemini returns functionCall(s) → call MCP tools
  5. Feed results back to Gemini
  6. Repeat until text answer or max steps

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
from fastmcp import Client

# Add parent to path for config
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import (
    GEMINI_API_KEY, GEMINI_MODEL, GEMINI_BASE_URL,
    MAX_STEPS, CALL_DELAY_SECONDS, MAX_OUTPUT_TOKENS,
)

# Import MCP server instance for in-memory client connection
from mcp_server import mcp as mcp_server

# Tools the agent should NOT send to Gemini (UI-only, not for LLM)
EXCLUDED_TOOLS = {"render_dashboard"}

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
  "er_diagram": "erDiagram\\n    parent ||--o{ child : \\"has\\"\\n    parent {\\n        INTEGER id PK\\n    }\\n    child {\\n        INTEGER id PK\\n        INTEGER parent_id FK\\n    }",
  "concepts": [
    {"name": "HAVING", "is_intended": true},
    {"name": "GROUP BY", "is_intended": true}
  ]
}
```"""


# ── MCP → Gemini schema conversion ──────────────────────────────────

def mcp_tools_to_gemini(tools) -> list[dict]:
    """Convert MCP tool schemas to Gemini functionDeclarations format.

    Dynamically builds declarations from whatever the MCP server exposes,
    instead of hardcoding them.
    """
    decls = []
    for tool in tools:
        if tool.name in EXCLUDED_TOOLS:
            continue
        schema = dict(tool.inputSchema) if tool.inputSchema else {"type": "object", "properties": {}}
        # Strip fields Gemini doesn't understand
        for key in ("$defs", "title", "additionalProperties"):
            schema.pop(key, None)
        for prop in schema.get("properties", {}).values():
            if isinstance(prop, dict):
                for key in ("title", "default"):
                    prop.pop(key, None)
        decls.append({
            "name": tool.name,
            "description": tool.description or "",
            "parameters": schema,
        })
    return decls


# ── MCP result extraction ───────────────────────────────────────────

def extract_text_result(result) -> dict:
    """Extract JSON dict from MCP CallToolResult text content.

    MCP tools return ToolResult with content=[TextContent(text=json)]
    plus structured_content (Prefab UI). We only need the text for Gemini.
    """
    if result.isError:
        texts = [c.text for c in (result.content or []) if hasattr(c, "text")]
        return {"error": " ".join(texts) or "Unknown tool error"}
    for block in (result.content or []):
        if hasattr(block, "text") and block.text:
            try:
                return json.loads(block.text)
            except json.JSONDecodeError:
                return {"result": block.text}
    return {"error": "No content returned"}


# ── Gemini API call ─────────────────────────────────────────────────

def call_gemini(messages: list, api_key: str, model: str, tool_declarations: list) -> dict:
    """Make a single Gemini API call with dynamically-discovered tool declarations."""
    url = f"{GEMINI_BASE_URL}/{model}:generateContent?key={api_key}"
    body = {
        "contents": messages,
        "tools": [{"functionDeclarations": tool_declarations}],
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


# ── Agent loop ──────────────────────────────────────────────────────

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

    # ══════════════════════════════════════════════════════════════
    # MCP Client Connection (in-memory transport to MCP server)
    # ══════════════════════════════════════════════════════════════
    print("=" * 62)
    print(f"[AGENT] Starting — prompt: \"{prompt}\"")
    print(f"[AGENT] Model: {model} | Max steps: {MAX_STEPS}")
    print("=" * 62)

    print("\n[MCP] Connecting to MCP server (in-memory transport)...")

    async with Client(mcp_server) as client:
        print(f"[MCP] Session initialized — server: \"{mcp_server.name}\"")

        # ── Dynamic Tool Discovery ──
        tools = await client.list_tools()
        tool_names = [t.name for t in tools]
        print(f"[MCP] list_tools() → {len(tools)} tools discovered:")
        for t in tools:
            excluded_tag = "  ← excluded (UI-only)" if t.name in EXCLUDED_TOOLS else ""
            print(f"  │ {t.name}{excluded_tag}")

        tool_declarations = mcp_tools_to_gemini(tools)
        print(f"[MCP] → Gemini: {len(tool_declarations)} functionDeclarations prepared")

        yield {"type": "system", "content": f"MCP connected — {len(tool_declarations)} tools discovered"}

        messages = [{"role": "user", "parts": [{"text": SYSTEM_PROMPT + "\n\nAdmin request: " + prompt}]}]
        step_count = 0
        tool_calls_made = 0
        tools_used = set()

        while step_count < MAX_STEPS:
            step_count += 1

            # Rate limit
            if step_count > 1:
                yield {"type": "system", "content": f"Waiting {CALL_DELAY_SECONDS}s before next Gemini call..."}
                await asyncio.sleep(CALL_DELAY_SECONDS)

            print(f"\n{'─' * 10} Step {step_count} {'─' * 10}")
            print(f"[LLM] Request #{step_count} → Gemini ({len(messages)} messages)")

            start = time.time()
            try:
                data = call_gemini(messages, api_key, model, tool_declarations)
            except Exception as e:
                latency = int((time.time() - start) * 1000)
                print(f"[LLM] ERROR ← {e} ({latency}ms)")
                yield {"type": "error", "content": f"Gemini call failed: {e}", "latencyMs": latency}
                break

            latency_ms = int((time.time() - start) * 1000)

            # Parse response
            candidates = data.get("candidates", [])
            if not candidates or not candidates[0].get("content", {}).get("parts"):
                finish = candidates[0].get("finishReason", "unknown") if candidates else "no candidates"
                print(f"[LLM] Empty response (finishReason: {finish})")
                yield {"type": "error", "content": f"Empty Gemini response ({finish})", "latencyMs": latency_ms}
                break

            parts = candidates[0]["content"]["parts"]
            usage = data.get("usageMetadata", {})
            print(f"[LLM] Response ← {latency_ms}ms | tokens: in={usage.get('promptTokenCount', '?')} out={usage.get('candidatesTokenCount', '?')}")

            # Preserve full parts in message history (including thoughtSignature)
            messages.append({"role": "model", "parts": parts})

            # Handle ALL tool calls (Gemini can return multiple in parallel)
            tool_calls = [p for p in parts if "functionCall" in p]
            text_part = next((p for p in parts if p.get("text", "").strip()), None)

            if tool_calls:
                if len(tool_calls) > 1:
                    print(f"[LLM] ({len(tool_calls)} parallel tool calls)")

                function_responses = []

                for tc in tool_calls:
                    fc = tc["functionCall"]
                    name = fc["name"]
                    args = fc.get("args", {})
                    tool_calls_made += 1
                    tools_used.add(name)

                    if tc.get("thoughtSignature"):
                        print(f"[LLM] Thought signature: {name} ({len(tc['thoughtSignature'])} chars)")

                    print(f"[LLM] functionCall: {name}({json.dumps(args)[:200]})")

                    if name == "insert_question":
                        print(f"[LLM] er_diagram in args: {'er_diagram' in args}")
                        if "er_diagram" in args:
                            print(f"[LLM] er_diagram value: {str(args['er_diagram'])[:200]}")

                    yield {
                        "type": "tool_call",
                        "tool": name,
                        "input": args,
                        "latencyMs": latency_ms,
                    }

                    # ── MCP Tool Execution ──
                    mcp_start = time.time()
                    print(f"\n[MCP] call_tool(\"{name}\", {json.dumps(args)[:100]})")
                    try:
                        mcp_result = await client.call_tool(name, args)
                        tool_result = extract_text_result(mcp_result)
                        mcp_ms = int((time.time() - mcp_start) * 1000)
                        has_structured = mcp_result.structuredContent is not None if hasattr(mcp_result, 'structuredContent') else False
                        text_bytes = len(json.dumps(tool_result))
                        print(f"[MCP] ← {mcp_ms}ms | text: {text_bytes} bytes | structuredContent: {'yes' if has_structured else 'no'}")
                        print(f"[MCP] Result: {json.dumps(tool_result)[:200]}")
                    except Exception as e:
                        mcp_ms = int((time.time() - mcp_start) * 1000)
                        tool_result = {"error": str(e)}
                        print(f"[MCP] ERROR ← {e} ({mcp_ms}ms)")

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

                # Send ALL tool results in a single user message
                messages.append({"role": "user", "parts": function_responses})
                continue

            if text_part:
                text = text_part["text"]
                print(f"[LLM] TEXT ({len(text)} chars):\n{text}")

                # Nudge if no tools used yet
                if tool_calls_made == 0 and step_count < MAX_STEPS:
                    print("[LLM] Nudging — no tools used yet")
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
            print(f"[LLM] Unexpected: {[list(p.keys()) for p in parts]}")
            yield {"type": "error", "content": "Unexpected Gemini response", "latencyMs": latency_ms}
            break

        if step_count >= MAX_STEPS:
            yield {"type": "error", "content": "Agent reached maximum step limit"}

        # ── Summary ──
        available_names = {t.name for t in tools} - EXCLUDED_TOOLS
        unused = available_names - tools_used
        print(f"\n{'=' * 62}")
        print(f"[AGENT] Complete: {step_count} steps, {tool_calls_made} tool calls")
        print(f"[AGENT] Tools used:      {', '.join(sorted(tools_used)) or '(none)'}")
        if unused:
            print(f"[AGENT] Tools available:  {', '.join(sorted(unused))} (not needed for this task)")
        print(f"{'=' * 62}")


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
