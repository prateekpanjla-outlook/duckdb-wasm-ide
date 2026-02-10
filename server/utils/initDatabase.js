import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function initDatabase() {
    const client = new Client({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: 'postgres', // Connect to default database first
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres'
    });

    try {
        console.log('🔌 Connecting to PostgreSQL...');
        await client.connect();
        console.log('✅ Connected to PostgreSQL');

        const dbName = process.env.DB_NAME || 'duckdb_ide';

        // Check if database exists
        const dbCheckResult = await client.query(
            'SELECT 1 FROM pg_database WHERE datname = $1',
            [dbName]
        );

        if (dbCheckResult.rows.length === 0) {
            // Create database
            console.log(`📊 Creating database: ${dbName}`);
            await client.query(`CREATE DATABASE ${dbName}`);
            console.log(`✅ Database created: ${dbName}`);
        } else {
            console.log(`✅ Database already exists: ${dbName}`);
        }

        // Close connection and reconnect to the new database
        await client.end();

        const dbClient = new Client({
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5432,
            database: dbName,
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'postgres'
        });

        await dbClient.connect();
        console.log(`🔌 Connected to database: ${dbName}`);

        // Create tables
        console.log('\n📋 Creating tables...');

        // Users table
        console.log('Creating users table...');
        await dbClient.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP
            )
        `);
        console.log('✅ Users table created');

        // Questions table
        console.log('Creating questions table...');
        await dbClient.query(`
            CREATE TABLE IF NOT EXISTS questions (
                id SERIAL PRIMARY KEY,
                sql_data TEXT NOT NULL,
                sql_question TEXT NOT NULL,
                sql_solution TEXT NOT NULL,
                sql_solution_explanation JSONB,
                difficulty VARCHAR(20) DEFAULT 'beginner',
                category VARCHAR(50) DEFAULT 'SELECT queries',
                order_index INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Questions table created');

        // User attempts table
        console.log('Creating user_attempts table...');
        await dbClient.query(`
            CREATE TABLE IF NOT EXISTS user_attempts (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
                user_query TEXT NOT NULL,
                is_correct BOOLEAN DEFAULT FALSE,
                attempts_count INTEGER DEFAULT 1,
                completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                time_taken_seconds INTEGER
            )
        `);
        console.log('✅ User attempts table created');

        // User sessions table
        console.log('Creating user_sessions table...');
        await dbClient.query(`
            CREATE TABLE IF NOT EXISTS user_sessions (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                current_question_id INTEGER REFERENCES questions(id) ON DELETE SET NULL,
                practice_mode_active BOOLEAN DEFAULT FALSE,
                last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ User sessions table created');

        // Create indexes for better performance
        console.log('\n📊 Creating indexes...');

        await dbClient.query(`
            CREATE INDEX IF NOT EXISTS idx_user_attempts_user_id
            ON user_attempts(user_id)
        `);

        await dbClient.query(`
            CREATE INDEX IF NOT EXISTS idx_user_attempts_question_id
            ON user_attempts(question_id)
        `);

        await dbClient.query(`
            CREATE INDEX IF NOT EXISTS idx_user_attempts_user_question
            ON user_attempts(user_id, question_id)
        `);

        console.log('✅ Indexes created');

        await dbClient.end();

        console.log('\n✨ Database initialization completed!');
        console.log(`\n📊 Database '${dbName}' is ready to use.`);
        console.log('\n💡 Next steps:');
        console.log('   1. Run: node seed/seedQuestions.js (to add sample questions)');
        console.log('   2. Run: npm run dev (to start the server)');

    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        process.exit(1);
    }
}

// Run initialization
initDatabase();
