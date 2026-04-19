# SQL Practice Project — Backend & Frontend Architecture

Current implementation as of 2026-04-19. This document describes what is built and deployed, not aspirational features.

## 1. User Authentication (Email/Password + Guest Access)

- Registration with email and password (min 6 chars, bcrypt hashed)
- Login returns JWT token (7-day expiry)
- **Guest access**: one-click start, creates anonymous user with `is_guest=true`, JWT expires in 24h
- **Guest upgrade**: convert guest to registered account, preserving all progress (same user_id)
- Token stored in `localStorage`, sent via `Authorization: Bearer` header
- `authenticate` middleware validates token on protected routes

## 2. SQL Practice Workflow

### 2.1 Post-Login Experience

After login, the user goes directly to the practice view:
- Question dropdown appears in the left panel
- User selects a question and clicks **Load Question**
- Tables from `sql_data` are created in the in-browser DuckDB WASM instance
- Question text, difficulty badge, and category are displayed
- SQL editor (CodeMirror) becomes active

There is no intermediate modal — practice is the default experience.

### 2.2 Question Bundle (from backend)

Backend serves a JSON bundle per question:
```json
{
  "id": 1,
  "sql_data": "CREATE TABLE employees (...); INSERT INTO employees VALUES (...);",
  "sql_question": "Find all employees earning more than 50000",
  "sql_solution": "SELECT * FROM employees WHERE salary > 50000",
  "sql_solution_explanation": ["Step 1: ...", "Step 2: ..."],
  "difficulty": "beginner",
  "category": "SELECT queries"
}
```

### 2.3 DuckDB Initialization (client-side)

1. DuckDB WASM loads in browser (EH bundle preferred, MVP fallback)
2. On question load, `sql_data` statements run against DuckDB (`CREATE OR REPLACE TABLE`)
3. User's SQL and the solution SQL both execute in-browser against the same data

### 2.4 Data Storage

| Data | Location | Reason |
|------|----------|--------|
| `sql_data` tables | DuckDB WASM (in-memory) | User queries run against this |
| `sql_question` | Frontend JS state | Display only |
| `sql_solution` | Frontend JS state | Run in DuckDB for comparison |
| `sql_solution_explanation` | Frontend JS state | Shown on "Show Solution" |

### 2.5 Run Code Button

- Executes user's SQL against DuckDB WASM
- Displays results in the results panel
- Does NOT validate against solution
- Shows execution time

### 2.6 Submit Code Button

- Executes user's SQL and the solution SQL in DuckDB WASM (sequentially)
- Compares results client-side with an **order-independent** comparator:
  - Row count must match
  - Column name set must match (regardless of order)
  - Each row is canonicalized (sorted column keys, values as strings), both sides sorted, then compared position-wise
- Sends `isCorrect` flag to backend — server trusts the client (no server-side re-grading)
- Backend records the attempt in `user_attempts`

### 2.7 Validation Feedback

- **Correct:** Green panel with "Correct! Well done!" and "Next Question" button
- **Incorrect:** Red panel with "Not quite right. Keep trying!" and pointer to Show Solution

### 2.8 Show Solution Button

- Always available (no attempt gating)
- Shows the correct SQL and step-by-step explanation array

### 2.9 Next Question Button

- Appears after a correct submission
- Calls `GET /api/practice/next` to fetch the next question
- Frontend re-initializes DuckDB tables with new `sql_data`
- Dropdown selection updates

## 3. API Endpoints

```
POST   /api/auth/register              Register with email + password
POST   /api/auth/login                 Login, returns JWT + user
POST   /api/auth/guest                 Create anonymous guest user (24h JWT)
POST   /api/auth/guest/upgrade         Convert guest to registered account
GET    /api/auth/me                    Get current user info
POST   /api/auth/logout                Logout (client deletes token)

GET    /api/practice/questions          List all questions (for dropdown)
GET    /api/practice/start              Get first question bundle
GET    /api/practice/next               Get next question (based on session)
GET    /api/practice/question/:id       Get specific question by ID
POST   /api/practice/verify             Submit answer — records attempt, returns isFirstSuccess
POST   /api/practice/attempt            Legacy attempt submission (not used by current UI)
GET    /api/practice/progress           User progress statistics
GET    /api/practice/session            Current session state
POST   /api/practice/session/activate   Activate practice mode
POST   /api/practice/session/deactivate Deactivate practice mode

POST   /api/ai/hint                    Get AI hint/explanation (Gemini, rate-limited)

POST   /api/admin/agent                Run Question Authoring Agent (X-Admin-Key required)
POST   /api/admin/agent/approve        Insert approved question + concept tags
POST   /api/admin/agent/generate-test  Generate Playwright test for a question
```

## 4. Frontend UI Components

### 4.1 Login/Register Modal
- Email + password inputs
- Toggle between login and register modes
- Client-side validation (email format, password min length)

### 4.2 Question Selector (post-login)
- Dropdown populated from `/api/practice/questions`
- Info panel shows: category badge, difficulty badge, table schema extracted from `sql_data`
- **Load Question** button fetches full question and initializes DuckDB tables

### 4.3 Practice Mode UI (when question loaded)
- Question display card with text and metadata
- CodeMirror SQL editor with syntax highlighting and autocomplete
- **Run (Ctrl+Enter)** — execute query, show results
- **Submit Code** — execute + compare + record attempt
- Feedback panel (correct/incorrect)
- **Show Solution** — reveals solution SQL + explanation
- **Next Question** — appears after correct answer

## 5. User Flow

```
Login → Question Dropdown → Select Question → Click "Load Question"
                                                       ↓
                                    Tables created in DuckDB (in-memory)
                                                       ↓
                                    Question text + schema displayed
                                                       ↓
                                    User writes query → Click "Run"
                                              ↓
                                          See results → Click "Submit"
                                              ↓
                                    Client compares results (order-independent)
                                    Server records attempt
                                   ↙                    ↘
                              Correct              Incorrect
                                  ↓                      ↓
                          "Next Question" button    Show differences
                                  ↓                      ↓
                          Click → Load next        Retry or click
                          question                 "Show Solution"
```

## 6. Database Schema (PostgreSQL)

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_guest BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

CREATE TABLE questions (
    id SERIAL PRIMARY KEY,
    sql_data TEXT NOT NULL,
    sql_question TEXT NOT NULL,
    sql_solution TEXT NOT NULL,
    sql_solution_explanation JSONB,
    difficulty VARCHAR(20) DEFAULT 'beginner',
    category VARCHAR(50) DEFAULT 'SELECT queries',
    order_index INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_attempts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    user_query TEXT NOT NULL,
    is_correct BOOLEAN DEFAULT FALSE,
    attempts_count INTEGER DEFAULT 1,
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    time_taken_seconds INTEGER
);

CREATE TABLE user_sessions (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    current_question_id INTEGER REFERENCES questions(id) ON DELETE SET NULL,
    practice_mode_active BOOLEAN DEFAULT FALSE,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

CREATE TABLE ai_usage (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cached BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sql_concepts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    category VARCHAR(50) NOT NULL,
    difficulty VARCHAR(20) DEFAULT 'beginner'
);

CREATE TABLE question_concepts (
    question_id INTEGER REFERENCES questions(id) ON DELETE CASCADE,
    concept_id INTEGER REFERENCES sql_concepts(id) ON DELETE CASCADE,
    is_intended BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (question_id, concept_id)
);
```

Tables and indexes are created automatically on server startup via `ensureTables()` in `server/server.js`. Questions are seeded from `server/seed/seedData.js` and SQL concepts from `server/seed/seedConcepts.js` if tables are empty.

## 7. Future Enhancements

See [future.md](./future.md) for planned features and [pending_tasks.md](./pending_tasks.md) for the full task list.
