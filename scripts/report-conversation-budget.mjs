import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (
  !url ||
  !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)
)
  throw new Error("A local database is required for the budget report");
const sql = postgres(url, { max: 1, connect_timeout: 10 });
try {
  const result = await sql.begin("read only", async (tx) => {
    const campaigns =
      await tx`SELECT id,enabled,blocked,expires_at,input_limit,output_limit,call_limit FROM conversation_campaign ORDER BY id`;
    const usage =
      await tx`SELECT * FROM conversation_budget_report ORDER BY campaign_id,evaluator_id,session_id,turn_id`;
    return { campaigns, usage };
  });
  console.log(
    JSON.stringify(
      {
        schema: 1,
        note: "Authorized requests are upper bounds for interrupted workers. Null readings are unknown; charged tokens retain unresolved reservations. Cache is included in input, not added again. Token counts are not a currency invoice.",
        ...result,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end();
}
