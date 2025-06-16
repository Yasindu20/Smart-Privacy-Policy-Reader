CREATE DATABASE privacy_reader; 
 
\c privacy_reader; 
 
CREATE TABLE users ( 
  id SERIAL PRIMARY KEY, 
  email VARCHAR(255) UNIQUE NOT NULL, 
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP 
); 
 
CREATE TABLE policies ( 
  id SERIAL PRIMARY KEY, 
  url TEXT NOT NULL, 
  domain VARCHAR(255), 
  title VARCHAR(255), 
  raw_text TEXT, 
  last_checked TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
  summary TEXT, 
  score INTEGER, 
  data_collected JSONB, 
  data_sharing JSONB, 
  retention_period TEXT, 
  user_rights JSONB, 
  red_flags JSONB 
); 
 
CREATE TABLE user_policies ( 
  id SERIAL PRIMARY KEY, 
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, 
  policy_id INTEGER REFERENCES policies(id) ON DELETE CASCADE, 
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
  UNIQUE(user_id, policy_id) 
); 
 
CREATE TABLE policy_history ( 
  id SERIAL PRIMARY KEY, 
  policy_id INTEGER REFERENCES policies(id) ON DELETE CASCADE, 
  snapshot_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
  raw_text TEXT, 
  summary TEXT, 
  score INTEGER, 
  changes_detected BOOLEAN DEFAULT FALSE 
); 
 
CREATE INDEX idx_policies_url ON policies(url); 
CREATE INDEX idx_policies_domain ON policies(domain); 
CREATE INDEX idx_user_policies_user_id ON user_policies(user_id); 
CREATE INDEX idx_policy_history_policy_id ON policy_history(policy_id);