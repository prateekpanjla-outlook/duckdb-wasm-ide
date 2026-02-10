# DuckDB WASM IDE - Backend Server

Backend server for the DuckDB WASM IDE with user authentication and SQL practice mode.

## Features

- **User Authentication**: Email/password registration and login with JWT tokens
- **SQL Practice Mode**: Question-based SQL learning with validation
- **Progress Tracking**: Track user attempts and progress statistics
- **Session Management**: Maintain practice mode state across requests

## Prerequisites

- **Node.js** 18+ and **npm**
- **PostgreSQL** 12+ running locally or accessible remotely

## Setup

### 1. Install Dependencies

```bash
cd server
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and update with your configuration:

```bash
cp .env.example .env
```

Edit `.env` with your database credentials:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:8000

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=duckdb_ide
DB_USER=postgres
DB_PASSWORD=your_password

# JWT Secret
JWT_SECRET=generate-a-strong-random-string-here
JWT_EXPIRES_IN=7d
```

### 3. Initialize Database

```bash
npm run init-db
```

This will:
- Create the database if it doesn't exist
- Create all required tables
- Create indexes for performance

### 4. Seed Sample Questions

```bash
npm run seed
```

This will add 7 sample SQL practice questions ranging from beginner to advanced.

## Running the Server

### Development Mode

```bash
npm run dev
```

Server will run on `http://localhost:3000` and auto-restart on changes.

### Production Mode

```bash
npm start
```

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login existing user |
| GET | `/api/auth/me` | Get current user info |
| POST | `/api/auth/logout` | Logout |

### Practice Mode

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/practice/start` | Get first question |
| GET | `/api/practice/next` | Get next question |
| GET | `/api/practice/question/:id` | Get specific question |
| POST | `/api/practice/verify` | Submit and verify solution |
| GET | `/api/practice/progress` | Get user progress |
| GET | `/api/practice/session` | Get session state |
| POST | `/api/practice/session/activate` | Activate practice mode |
| POST | `/api/practice/session/deactivate` | Deactivate practice mode |
| GET | `/api/practice/questions` | List all questions |

## Database Schema

### Users Table
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);
```

### Questions Table
```sql
CREATE TABLE questions (
    id SERIAL PRIMARY KEY,
    sql_data TEXT NOT NULL,
    sql_question TEXT NOT NULL,
    sql_solution TEXT NOT NULL,
    sql_solution_explanation JSONB,
    difficulty VARCHAR(20) DEFAULT 'beginner',
    category VARCHAR(50) DEFAULT 'SELECT queries',
    order_index INTEGER
);
```

### User Attempts Table
```sql
CREATE TABLE user_attempts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    question_id INTEGER REFERENCES questions(id),
    user_query TEXT NOT NULL,
    is_correct BOOLEAN DEFAULT FALSE,
    attempts_count INTEGER DEFAULT 1,
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    time_taken_seconds INTEGER
);
```

### User Sessions Table
```sql
CREATE TABLE user_sessions (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    current_question_id INTEGER REFERENCES questions(id),
    practice_mode_active BOOLEAN DEFAULT FALSE,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Example API Usage

### Register a User

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'
```

Response:
```json
{
  "message": "User registered successfully",
  "user": { "id": 1, "email": "user@example.com" },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'
```

### Get First Practice Question

```bash
curl http://localhost:3000/api/practice/start \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

Response:
```json
{
  "question": {
    "id": 1,
    "sql_data": "CREATE TABLE employees...",
    "sql_question": "Select all employees from Engineering department",
    "sql_solution_explanation": [...],
    "difficulty": "beginner",
    "category": "SELECT queries"
  }
}
```

### Submit Solution

```bash
curl -X POST http://localhost:3000/api/practice/verify \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "questionId": 1,
    "userQuery": "SELECT * FROM employees WHERE department = '\''Engineering'\''",
    "isCorrect": true,
    "timeTakenSeconds": 45
  }'
```

## Project Structure

```
server/
├── config/
│   └── database.js         # PostgreSQL connection pool
├── controllers/            # (Future: request handlers)
├── middleware/
│   ├── auth.js            # JWT authentication middleware
│   └── validate.js        # Input validation
├── models/
│   ├── User.js            # User model
│   ├── Question.js        # Question model
│   ├── UserAttempt.js     # User attempts model
│   └── UserSession.js     # User session model
├── routes/
│   ├── auth.js            # Authentication routes
│   └── practice.js        # Practice mode routes
├── seed/
│   └── seedQuestions.js   # Sample questions seeder
├── utils/
│   └── initDatabase.js    # Database initialization
├── .env.example           # Environment variables template
├── package.json           # Dependencies
├── server.js              # Express server entry point
└── README.md              # This file
```

## Development

### Adding New Questions

Edit `seed/seedQuestions.js` and add new question objects to the array:

```javascript
{
    sql_data: `CREATE TABLE ...`,
    sql_question: 'Your question here',
    sql_solution: 'SELECT ...',
    sql_solution_explanation: [
        'Step 1 explanation',
        'Step 2 explanation'
    ],
    difficulty: 'beginner', // or 'intermediate', 'advanced'
    category: 'SELECT queries',
    order_index: 8
}
```

Then re-run: `npm run seed`

### Testing Endpoints

Use the included `curl` examples or a tool like:
- Postman
- Insomnia
- HTTPie
- Thunder Client (VSCode extension)

## Security

- Passwords hashed with bcryptjs (10 rounds)
- JWT tokens for authentication
- Helmet.js for security headers
- Rate limiting (100 requests per 15 minutes)
- CORS configured for frontend only
- SQL injection prevented via parameterized queries

## Troubleshooting

### Database Connection Error

Make sure PostgreSQL is running:
```bash
# Check PostgreSQL status
sudo service postgresql status

# Start PostgreSQL if needed
sudo service postgresql start
```

### Port Already in Use

Change the PORT in `.env` or kill the process using port 3000:
```bash
lsof -ti:3000 | xargs kill -9
```

### JWT Secret Error

Make sure `JWT_SECRET` is set in `.env`:
```bash
# Generate a random secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Future Enhancements

See [future.md](../docs/future.md) for planned features including:
- Social login (Google, GitHub)
- User roles and permissions
- Question editor and admin panel
- Real-time collaboration
- Performance analytics
