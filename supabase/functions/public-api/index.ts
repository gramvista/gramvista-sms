import { db, client } from "../_shared/database.ts";
import {
  makeHandler,
  resolveKey,
  ApiError,
  type Identity,
} from "../../../server/service.ts";
const handler = makeHandler(
  db,
  Deno.env.toObject(),
  async (req, requestId): Promise<Identity> => {
    const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
    if (!token) throw new ApiError("UNAUTHORIZED", 401);
    if (token.startsWith("gvs_"))
      return resolveKey(db, token, requestId, new URL(req.url).pathname);
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user || !data.user.email_confirmed_at)
      throw new ApiError("UNAUTHORIZED", 401);
    await db.rpc("claim_platform_admin", { p_user: data.user.id });
    await db.rpc("accept_invitations", {
      p_user: data.user.id,
      p_email: data.user.email!,
    });
    const members = await db.list("organization_members", {
      user_id: data.user.id,
      status: "active",
    });
    const requested = req.headers.get("X-Organization-Id");
    const member = requested
      ? members.find((m) => m.organization_id === requested)
      : members[0];
    if (requested && !member) throw new ApiError("FORBIDDEN", 403);
    return {
      userId: data.user.id,
      orgId: member?.organization_id ?? null,
      role: member?.role_id ?? "none",
      permissions: member
        ? (await db.list("role_permissions", { role_id: member.role_id })).map(
            (p) => p.permission_id,
          )
        : [],
      admin: Boolean(
        (await db.list("platform_admins", { user_id: data.user.id }))[0],
      ),
      test: false,
    };
  },
);
Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const allowed = (Deno.env.get("APP_ALLOWED_ORIGINS") ?? "").split(",");
  const cors: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, idempotency-key, x-organization-id",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  };
  if (origin && allowed.includes(origin))
    cors["Access-Control-Allow-Origin"] = origin;
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });
  const response = await handler(req);
  for (const [k, v] of Object.entries(cors)) response.headers.set(k, v);
  return response;
});
