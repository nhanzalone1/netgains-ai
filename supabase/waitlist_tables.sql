-- Waitlist & Allowed Testers Tables for NetGains AI
-- Run this in your Supabase SQL Editor

-- Table: waitlist_emails
-- Stores emails of users who want to join the beta
CREATE TABLE IF NOT EXISTS waitlist_emails (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: allowed_testers
-- Stores emails of users who are allowed to access the app
CREATE TABLE IF NOT EXISTS allowed_testers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  added_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE waitlist_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE allowed_testers ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can insert into waitlist_emails (for joining waitlist)
CREATE POLICY "Anyone can join waitlist" ON waitlist_emails
  FOR INSERT WITH CHECK (true);

-- Policy: Users can read their own waitlist entry
CREATE POLICY "Users can read own waitlist entry" ON waitlist_emails
  FOR SELECT USING (auth.jwt() ->> 'email' = email);

-- Policy: Authenticated users can check allowed_testers (to verify access)
CREATE POLICY "Authenticated users can check allowed_testers" ON allowed_testers
  FOR SELECT USING (auth.role() = 'authenticated');

-- Insert initial allowed testers
INSERT INTO allowed_testers (email, added_by) VALUES
  ('nanzalon@charlotte.edu', 'initial_setup'),
  ('nhanzalone1@gmail.com', 'initial_setup')
ON CONFLICT (email) DO NOTHING;
