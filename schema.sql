-- ============================================================
--  LINK · Ocean-Gloss Messaging + Global Language-Exchange Feed
--  PHASE 1 · Database Architecture
--  Run this entire file in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users (Interpals-style language / culture profile) ------
CREATE TABLE IF NOT EXISTS users (
    id UUID REFERENCES auth.users NOT NULL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    avatar_url TEXT,
    bio TEXT,
    native_language TEXT,
    learning_language TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 2. Direct Messages (The Link Core) --------------------------
CREATE TABLE IF NOT EXISTS messages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    sender_id UUID REFERENCES users(id) NOT NULL,
    receiver_id UUID REFERENCES users(id) NOT NULL,
    content TEXT NOT NULL,
    read_status BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);
CREATE INDEX IF NOT EXISTS idx_messages_pair
    ON messages (sender_id, receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread
    ON messages (receiver_id, read_status);

-- 3. Global Feed Posts (Facebook / Interpals scroll) ---------
CREATE TABLE IF NOT EXISTS feed_posts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    author_id UUID REFERENCES users(id) NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);
CREATE INDEX IF NOT EXISTS idx_feed_created
    ON feed_posts (created_at DESC);

-- 4. Post Likes ----------------------------------------------
CREATE TABLE IF NOT EXISTS post_likes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    post_id UUID REFERENCES feed_posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(post_id, user_id)
);

-- ============================================================
-- 5. ROW LEVEL SECURITY (recommended — keeps the anon key safe)
--    The app was built against exactly these policies.
-- ============================================================
ALTER TABLE users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;

-- users: everyone can discover profiles; only you can write yours
DROP POLICY IF EXISTS "profiles are public"   ON users;
DROP POLICY IF EXISTS "insert own profile"    ON users;
DROP POLICY IF EXISTS "update own profile"    ON users;
CREATE POLICY "profiles are public" ON users FOR SELECT USING (true);
CREATE POLICY "insert own profile"  ON users FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "update own profile"  ON users FOR UPDATE USING (auth.uid() = id);

-- messages: participants only; sender inserts; receiver marks read
DROP POLICY IF EXISTS "read own conversations"  ON messages;
DROP POLICY IF EXISTS "send messages"           ON messages;
DROP POLICY IF EXISTS "mark received as read"   ON messages;
CREATE POLICY "read own conversations" ON messages FOR SELECT
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "send messages" ON messages FOR INSERT
    WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "mark received as read" ON messages FOR UPDATE
    USING (auth.uid() = receiver_id);

-- feed: public read; authors write their own
DROP POLICY IF EXISTS "feed is public"   ON feed_posts;
DROP POLICY IF EXISTS "create posts"     ON feed_posts;
DROP POLICY IF EXISTS "delete own posts" ON feed_posts;
CREATE POLICY "feed is public"   ON feed_posts FOR SELECT USING (true);
CREATE POLICY "create posts"     ON feed_posts FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "delete own posts" ON feed_posts FOR DELETE USING (auth.uid() = author_id);

-- likes: public read; users toggle their own
DROP POLICY IF EXISTS "likes are public" ON post_likes;
DROP POLICY IF EXISTS "like posts"       ON post_likes;
DROP POLICY IF EXISTS "unlike posts"     ON post_likes;
CREATE POLICY "likes are public" ON post_likes FOR SELECT USING (true);
CREATE POLICY "like posts"       ON post_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "unlike posts"     ON post_likes FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 6. REALTIME — live chat + live "new posts" pill
--    (safe to re-run; duplicate_object errors are swallowed)
-- ============================================================
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE feed_posts;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Done. 🌊 Now serve the app (see README.md).
