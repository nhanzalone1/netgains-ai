-- Chat messages table for cross-device persistence
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  hidden boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Index for fast user message retrieval
CREATE INDEX chat_messages_user_id_idx ON public.chat_messages(user_id, created_at DESC);

-- RLS
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own chat messages" ON public.chat_messages
  FOR ALL USING (auth.uid() = user_id);
