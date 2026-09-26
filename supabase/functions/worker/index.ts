import { db } from "../_shared/database.ts";
import {
  processJobs,
  reconcile,
  syncBalance,
  deliverWebhooks,
  reconcileClickPesaPayments,
} from "../../../server/service.ts";
Deno.serve(async (req) => {
  const secret = Deno.env.get("WORKER_SECRET");
  if (!secret || req.headers.get("Authorization") !== "Bearer " + secret)
    return new Response("Unauthorized", { status: 401 });
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  const env = Deno.env.toObject();
  const token = crypto.randomUUID();
  const deadline = Date.now() + 90000;
  if (!(await db.rpc("claim_worker", { p_token: token })))
    return Response.json({ skipped: "Worker already active" });
  try {
    let balanceSynced = true;
    try {
      await syncBalance(db, env);
    } catch {
      balanceSynced = false;
    }
    const sends = await processJobs(db, env, deadline, true);
    const payments = await reconcileClickPesaPayments(db, env, deadline);
    const reports = await reconcile(db, env, deadline);
    const webhooks = await deliverWebhooks(db, env, deadline);
    return Response.json({
      balance_synced: balanceSynced,
      ...sends,
      ...payments,
      ...reports,
      ...webhooks,
    });
  } catch {
    return Response.json(
      { error: "Worker operation failed; inspect jobs and snapshots." },
      { status: 503 },
    );
  } finally {
    await db.rpc("release_worker", { p_token: token });
  }
});
