# SQL Practice Project - Backend Requirements

## Current Implementation Scope

### 1. User Authentication (Email/Password)
- User registration with email and password
- User login with email and password
- JWT token-based authentication
- Password hashing with bcrypt
- Session management

### 2. SQL Practice Mode Workflow

#### 2.1 Post-Login Experience
After successful login, the user is taken directly to the practice view:
- Question dropdown appears in the left panel
- User selects a question and clicks **Load Question**
- Tables from `sql_data` are created in the in-browser DuckDB instance
- Question text, difficulty badge, and category are displayed
- SQL editor becomes active

There is no intermediate "Yes/No, do you want to practice?" modal — the practice flow is the default experience.

#### 2.2 Backend - SQL Practice Bundle
Backend creates and sends a JSON bundle containing:
```json
{
  "question_id": 1,
  "sql_data": "-- SQL data/schema setup statements",
  "sql_question": "Find all employees earning more than 50000",
  "sql_solution": "SELECT * FROM employees WHERE salary > 50000",
  "sql_solution_explanation": [
    "Step 1: Select all columns from employees table",
    "Step 2: Filter rows where salary is greater than 50000"
  ],
  "difficulty": "beginner",
  "category": "SELECT queries"
}
```

#### 2.3 Frontend - DuckDB Initialization
1. Instantiate new DuckDB WASM instance
2. Load `sql_data` into DuckDB (execute schema/data setup)
3. Display `sql_question` to user
4. Store `sql_solution` and `sql_solution_explanation` (NOT in DuckDB initially)

#### 2.4 Data Storage Decision

**Storage Strategy:**

| Data Type | Storage Location | Reason |
|-----------|-----------------|--------|
| `sql_data` | DuckDB WASM (in-memory) | User queries run against this data |
| `sql_question` | Frontend state (JavaScript) | Display to user, no query needed |
| `sql_solution` | Frontend state + optional temp table | For validation comparison |
| `sql_solution_explanation` | Frontend state (JavaScript) | Show after user attempts or requests |

**Alternative for sql_solution:**
- Option A: Keep in JavaScript, compare result sets after execution
- Option B: Create temporary DuckDB table with solution results, use SQL to compare
- **Recommended**: Option A for simplicity, Option B for complex validation

#### 2.5 Run Code Button
- Executes user's SQL query against DuckDB
- Displays query results in results panel
- Does NOT validate against solution
- Shows execution time

#### 2.6 Submit Code Button
- Executes user's SQL query
- Compares results with `sql_solution` results
- **Comparison Logic:**
  ```javascript
  // Option A: Result set comparison
  compareResultSets(userResults, solutionResults) {
    // Compare: row count, column names, column values
    // Return: { isCorrect: boolean, differences: array }
  }

  // Option B: Load solution in DuckDB and SQL comparison
  // Create temp table with solution results
  // Use EXCEPT or UNION to find differences
  ```

#### 2.7 Validation Feedback
- **Match**: Show green success message "✓ Correct!"
- **No Match**: Show red message with details:
  - Row count difference
  - Column differences
  - Sample of differing rows

#### 2.8 Show Solution Button
- Always available (or after 3 failed attempts)
- Modal/panel showing:
  - Correct SQL solution
  - Step-by-step explanation (from `sql_solution_explanation`)
  - "Try Again" button to close

#### 2.9 Next Question Button
- Only appears when solution is correct
- Clicking requests next question bundle from backend
- Backend sends new bundle with incremented question_id
- Frontend re-initializes DuckDB with new data

### 3. Backend API Endpoints

```
POST   /api/auth/register         - User registration
POST   /api/auth/login            - User login
GET    /api/auth/me               - Get current user info
POST   /api/auth/logout           - Logout (invalidate token)

GET    /api/practice/questions    - List all questions (for dropdown)
GET    /api/practice/start        - Get first question bundle
GET    /api/practice/next         - Get next question
GET    /api/practice/question/:id - Get specific question
POST   /api/practice/verify       - Submit and verify solution (records attempt)
GET    /api/practice/progress     - Get user's progress statistics
GET    /api/practice/session      - Get current session state
POST   /api/practice/session/activate    - Activate practice mode
POST   /api/practice/session/deactivate  - Deactivate practice mode
```

### 4. Frontend UI Components

#### 4.1 Login/Register Modal
- Email input
- Password input
- Toggle between login/register
- Form validation

#### 4.2 Question Selector (post-login)
- Dropdown populated from `/api/practice/questions`
- Each option shows "Q{n}: {sql_question}"
- **Load Question** button triggers `/api/practice/question/:id` fetch
- Question info panel: category badge, difficulty badge, description, extracted table schema

#### 4.3 Practice Mode UI (when question loaded)
- Question display card with text and metadata
- CodeMirror SQL editor
- Two buttons: **Run (Ctrl+Enter)** and **Submit Code**
- Results table (right panel)
- Feedback panel (correct/incorrect) — shown after submit
- **Show Solution** button — reveals solution SQL + step-by-step explanation
- **Next Question** button — appears after correct answer

### 5. User Flow

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
                                    Server records attempt
                                    Frontend compares results
                                   ↙                    ↘
                              Correct              Incorrect
                                  ↓                      ↓
                          "Next Question" button    Show differences
                                  ↓                      ↓
                          Click → Load next        Retry or click
                          question                 "Show Solution"
```

### 6. Database Schema (PostgreSQL)

```sql
-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

-- Questions table
CREATE TABLE questions (
    id SERIAL PRIMARY KEY,
    sql_data TEXT NOT NULL,
    sql_question TEXT NOT NULL,
    sql_solution TEXT NOT NULL,
    sql_solution_explanation JSONB,
    difficulty VARCHAR(20),
    category VARCHAR(50),
    order_index INTEGER
);

-- User progress tracking
CREATE TABLE user_attempts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    question_id INTEGER REFERENCES questions(id),
    user_query TEXT,
    is_correct BOOLEAN,
    attempts_count INTEGER,
    completed_at TIMESTAMP,
    time_taken_seconds INTEGER
);

-- User sessions (for tracking current question)
CREATE TABLE user_sessions (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    current_question_id INTEGER REFERENCES questions(id),
    practice_mode_active BOOLEAN DEFAULT FALSE,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 7. State Management

#### Frontend State (JavaScript)
```javascript
{
  user: {
    id: number,
    email: string,
    token: string
  },
  practiceMode: {
    isActive: boolean,
    currentQuestion: {
      id: number,
      question: string,
      solution: string,
      explanation: array
    },
    duckdbInstance: object,
    userAttempts: number,
    showSolution: boolean
  }
}
```

### 8. Error Handling

- Invalid credentials: "Invalid email or password"
- User already exists: "Email already registered"
- No more questions: "You've completed all available questions!"
- DuckDB initialization failure: "Failed to load practice data"
- Invalid SQL: Show DuckDB error message

### 9. Success Metrics

- User can register and login
- Practice mode activates after login
- Question displays correctly
- Run code executes and shows results
- Submit validates correctly
- Next question loads properly
- Progress is tracked

---

## Future Enhancements

See [future.md](./future.md) for planned features including:
- Social login (Google, GitHub)
- Multiple difficulty levels
- Leaderboards
- Custom question creation
- Collaborative features
