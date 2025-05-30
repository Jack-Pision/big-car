-- Create sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- Create chats table with a foreign key to sessions
CREATE TABLE IF NOT EXISTS chats (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  messages JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- Create function to create sessions table
CREATE OR REPLACE FUNCTION create_sessions_table()
RETURNS VOID AS $$
BEGIN
  CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  );
END;
$$ LANGUAGE plpgsql;

-- Create function to create chats table
CREATE OR REPLACE FUNCTION create_chats_table()
RETURNS VOID AS $$
BEGIN
  CREATE TABLE IF NOT EXISTS chats (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    messages JSONB NOT NULL DEFAULT '[]'::JSONB,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  );
END;
$$ LANGUAGE plpgsql; 