import { getDb } from "../lib/db";
const db = getDb();

const HANDLES = ['', 'YXJ'];
const groups = db.prepare(`
  SELECT COUNT(*) AS n FROM sessions s
  WHERE s.archived = 0
    AND s.chat_type = 'group'
    AND s.history_indexed_through IS NOT NULL
    AND COALESCE(s.message_count, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM messages m
      WHERE m.chat_username = s.username
        AND m.sender IN ('', 'YXJ')
    )
`).get();
console.log('groups I never sent in:', groups);

const priv = db.prepare(`
  SELECT COUNT(*) AS n FROM sessions s
  WHERE s.archived = 0
    AND s.chat_type = 'private'
    AND s.history_indexed_through IS NOT NULL
    AND COALESCE(s.message_count, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM messages m
      WHERE m.chat_username = s.username
        AND m.sender IN ('', 'YXJ')
    )
`).get();
console.log('private chats I never replied to:', priv);

console.log('\n=== sample 10 ===');
console.table(db.prepare(`
  SELECT s.display_name, s.chat_type, s.message_count,
         datetime(s.last_timestamp, 'unixepoch', 'localtime') AS last_active
  FROM sessions s
  WHERE s.archived = 0
    AND s.chat_type IN ('group', 'private')
    AND s.history_indexed_through IS NOT NULL
    AND COALESCE(s.message_count, 0) > 0
    AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.chat_username = s.username AND m.sender IN ('', 'YXJ'))
  ORDER BY s.last_timestamp DESC
  LIMIT 10
`).all());
