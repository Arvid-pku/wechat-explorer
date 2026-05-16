import { getDb } from "../lib/db";

const db = getDb();
console.log("=== Top 10 groups by distinct_senders ===");
console.table(
  db
    .prepare(
      `SELECT display_name, distinct_senders, message_count
       FROM sessions WHERE chat_type = 'group' AND archived = 0
       ORDER BY distinct_senders DESC LIMIT 10`,
    )
    .all(),
);

console.log("\n=== Group size distribution ===");
console.table(
  db
    .prepare(
      `SELECT
         SUM(CASE WHEN distinct_senders >= 200 THEN 1 ELSE 0 END) AS "ge200",
         SUM(CASE WHEN distinct_senders >= 100 AND distinct_senders < 200 THEN 1 ELSE 0 END) AS "100to199",
         SUM(CASE WHEN distinct_senders >= 50 AND distinct_senders < 100 THEN 1 ELSE 0 END) AS "50to99",
         SUM(CASE WHEN distinct_senders >= 20 AND distinct_senders < 50 THEN 1 ELSE 0 END) AS "20to49",
         SUM(CASE WHEN distinct_senders < 20 THEN 1 ELSE 0 END) AS "lt20"
       FROM sessions WHERE chat_type = 'group' AND archived = 0`,
    )
    .all(),
);
