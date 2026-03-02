/**
 * Database Migration Script for Cloud Build
 *
 * This script creates all database tables and indexes.
 * It's designed to be run from Cloud Build during deployment.
 *
 * Usage: node server/scripts/migrateDatabase.js
 *
 * Environment variables required:
 *   - DB_HOST: Cloud SQL connection string (/cloudsql/PROJECT:REGION:INSTANCE)
 *   - DB_PORT: Database port (5432)
 *   - DB_NAME: Database name
 *   - DB_USER: Database user
 *   - DB_PASSWORD: Database password
 */

import pg from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const { Client } = pg;

async function migrateDatabase() {
    const client = new Client({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'duckdb_ide',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
    });

    try {
        console.log('🔌 Connecting to database...');
        await client.connect();
        console.log('✅ Connected to database');

        console.log('\n📋 Running migrations...\n');

        // Create users table
        console.log('Creating users table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP
            )
        `);
        console.log('✅ Users table created');

        // Create questions table
        console.log('Creating questions table...');
        await client.query(`
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

        // Create user_attempts table
        console.log('Creating user_attempts table...');
        await client.query(`
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

        // Create user_sessions table
        console.log('Creating user_sessions table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_sessions (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                current_question_id INTEGER REFERENCES questions(id) ON DELETE SET NULL,
                practice_mode_active BOOLEAN DEFAULT FALSE,
                last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ User sessions table created');

        // Create indexes
        console.log('\n📊 Creating indexes...');
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_user_attempts_user_id
            ON user_attempts(user_id)
        `);
        console.log('✅ Index: idx_user_attempts_user_id');

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_user_attempts_question_id
            ON user_attempts(question_id)
        `);
        console.log('✅ Index: idx_user_attempts_question_id');

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_user_attempts_user_question
            ON user_attempts(user_id, question_id)
        `);
        console.log('✅ Index: idx_user_attempts_user_question');

        console.log('\n✨ Database migration completed successfully!');
        console.log(`\n📊 Database '${process.env.DB_NAME || 'duckdb_ide'}' is ready to use.\n`);

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await client.end();
        console.log('🔌 Database connection closed');
    }
}

// Run migration
migrateDatabase();
