import { SenderReview } from "./sender-review";
import { OrderDetail } from "./order-detail";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ShieldCheck,
  ArrowLeft,
  RefreshCw,
  Plus,
  Wallet,
  Building2,
  Activity,
} from "lucide-react";
import { api, supabase } from "../lib/api";
import {
  PageTitle,
  ErrorBox,
  Badge,
  Modal,
  number,
  Empty,
  date,
  Pagination,
} from "../components/ui";
export function Platform() {
  const client = useQueryClient();
  const [reviewing, setReviewing] = useState<any>(null);
  const [reviewingOrder, setReviewingOrder] = useState<any>(null);
  const [tab, setTab] = useState("organizations");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState("");
  const [editing, setEditing] = useState<any>(null);
  const [error, setError] = useState<unknown>();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const session = useQuery({
    queryKey: ["platform-session"],
    queryFn: () => api("session", { platform: true }),
  });
  const allowed = session.data?.identity.admin;
  const query = useQuery({
    queryKey: ["platform", tab, page],
    queryFn: () => api("platform/" + tab + "?page=" + page, { platform: true }),
    enabled: Boolean(allowed),
  });
  const organizations = useQuery({
    queryKey: ["platform", "organization-options"],
    queryFn: () => api("platform/organizations", { platform: true }),
    enabled: Boolean(allowed),
  });
  const stats = useQuery({
    queryKey: ["platform-stats"],
    queryFn: () => api("platform/stats", { platform: true }),
    enabled: Boolean(allowed),
  });
  async function action(path: string, body?: unknown, method = "POST") {
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      const r = await api("platform/" + path, { method, body, platform: true });
      await client.invalidateQueries({ queryKey: ["platform"] });
      await client.invalidateQueries({ queryKey: ["platform-stats"] });
      setModal("");
      setNotice("Operation completed.");
      return r;
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  if (session.isLoading)
    return <div className="standalone">Checking platform access…</div>;
  if (!allowed)
    return (
      <div className="standalone">
        <h1>Platform access required</h1>
        <p>This area is reserved for Gramvista platform administrators.</p>
        <ErrorBox error={session.error} />
        <Link to="/">Return to workspace</Link>
      </div>
    );
  const s = stats.data ?? {};
  const columns: Record<string, string[]> = {
    organizations: ["name", "email", "status", "created_at"],
    wallets: ["organization_id", "available_units", "reserved_units"],
    senders: ["sender_name", "legal_business_name", "purpose", "status"],
    documents: [
      "organization_id",
      "sender_id_id",
      "document_type",
      "created_at",
    ],
    payments: [
      "order_reference",
      "payment_reference",
      "organization_id",
      "method",
      "amount",
      "currency",
      "sms_units",
      "status",
    ],
    pricing: ["min_units", "max_units", "price_per_unit", "currency"],
    packages: ["name", "sms_units", "selling_price", "currency", "active"],
    snapshots: ["provider", "balance_sms", "success", "checked_at"],
    audit: ["action", "actor_id", "resource_id", "created_at"],
    submissions: ["provider", "provider_reference", "valid_contacts", "status"],
    jobs: [
      "batch_number",
      "recipient_count",
      "status",
      "attempts",
      "last_error",
    ],
    costs: [
      "provider",
      "cost_per_unit",
      "currency",
      "warning_threshold",
      "critical_threshold",
    ],
    usage: [
      "provider",
      "message_units",
      "provider_cost",
      "currency",
      "created_at",
    ],
  };
  return (
    <div className="platform-page">
      <header className="platform-top">
        <span>
          <ShieldCheck />
          Gramvista <strong>Platform</strong>
        </span>
        <Link to={session.data?.organization ? "/" : "/onboarding"}>
          <ArrowLeft size={16} />
          {session.data?.organization
            ? "Customer workspace"
            : "Create customer workspace"}
        </Link>
      </header>
      <main>
        <PageTitle
          eyebrow="GRAMVISTA EMPIRE GROUP LIMITED"
          title="Platform administration"
          description="Customer operations, messaging capacity and financial controls."
          action={
            <>
              <button
                className="button secondary"
                onClick={() => setModal("package")}
              >
                <Plus size={16} />
                New package
              </button>
              <button className="button" onClick={() => setModal("credit")}>
                <Wallet size={16} />
                Adjust wallet
              </button>
            </>
          }
        />
        {session.data.demo && (
          <div className="notice">
            Local administration · All messages and provider balances are
            simulated. Credits affect only the development wallet.
          </div>
        )}
        <ErrorBox error={error || query.error || stats.error} />
        {notice && <div className="notice success">{notice}</div>}
        <div className="metrics">
          <div className="metric">
            <div className="metric-top">
              Organizations
              <Building2 size={20} />
            </div>
            <strong>{number(s.organizations)}</strong>
            <small>Registered businesses</small>
          </div>
          <div className="metric">
            <div className="metric-top">
              Customer liability
              <Wallet size={20} />
            </div>
            <strong>{number(s.liability)}</strong>
            <small>Available + reserved SMS</small>
          </div>
          <div className="metric">
            <div className="metric-top">
              Provider inventory
              <Activity size={20} />
            </div>
            <strong>{s.balance == null ? "—" : number(s.balance)}</strong>
            <small>{s.provider ?? "No balance snapshot"}</small>
          </div>
          <div className="metric">
            <div className="metric-top">
              Capacity after liabilities
              <ShieldCheck size={20} />
            </div>
            <strong>
              {s.balance == null ? "—" : number(s.balance - s.liability)}
            </strong>
            <small>
              {s.balance != null && s.balance < s.liability
                ? "Capacity is below customer liabilities"
                : "Compare inventory with allocated credits"}
            </small>
          </div>
        </div>
        <div className="notice">
          Fund your Kilakona account, then sync its balance. Customer purchases
          appear under payments. ClickPesa payments are credited automatically
          after provider confirmation. For manual payments, confirm receipt before
          selecting Verify &amp; credit. That action adds the purchased units once;
          syncing inventory alone never adds customer credits. Compare capacity
          with customer liability before allocating more credits.
        </div>
        <div className="admin-tools">
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => action("sync-balance")}
          >
            <RefreshCw size={16} />
            Sync provider balance
          </button>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => action("process")}
          >
            Process queued batches
          </button>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => action("reconcile")}
          >
            Reconcile delivery
          </button>
          <span className="muted">
            Revenue:{" "}
            {s.revenue
              ?.map((r: any) => `${r.currency} ${r.total}`)
              .join(" · ") ?? "No verified payments"}{" "}
            · Provider costs remain unset until agreed.
          </span>
        </div>
        <div className="tabs scroll-tabs">
          {Object.keys(columns).map((t) => (
            <button
              key={t}
              className={tab === t ? "selected" : ""}
              onClick={() => {
                setTab(t);
                setPage(1);
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <section className="panel">
          {query.data?.data.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {columns[tab].map((c) => (
                      <th key={c}>{c.replaceAll("_", " ")}</th>
                    ))}
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.data.map((r: any) => (
                    <tr key={r.id}>
                      {columns[tab].map((c) => (
                        <td key={c}>
                          {c === "status" ? (
                            <Badge status={r[c]} />
                          ) : c.endsWith("_at") ? (
                            date(r[c])
                          ) : (
                            <span className="truncate">
                              {c === "organization_id"
                                ? (organizations.data?.data.find(
                                    (o: any) => o.id === r[c],
                                  )?.name ?? r[c])
                                : String(r[c] ?? "—")}
                            </span>
                          )}
                        </td>
                      ))}
                      <td>
                        {["packages", "costs"].includes(tab) && (
                          <button
                            className="button secondary small"
                            onClick={() => {
                              setError(null);
                              setEditing({ ...r, _type: tab });
                            }}
                          >
                            Edit
                          </button>
                        )}
                        {tab === "documents" && supabase && (
                          <button
                            className="button secondary small"
                            onClick={async () => {
                              try {
                                const { data, error } = await supabase!.storage
                                  .from("sender-documents")
                                  .createSignedUrl(r.storage_path, 60);
                                if (error) throw error;
                                window.open(
                                  data.signedUrl,
                                  "_blank",
                                  "noopener,noreferrer",
                                );
                              } catch (e) {
                                setError(e);
                              }
                            }}
                          >
                            View private document
                          </button>
                        )}
                        {tab === "packages" && (
                          <button
                            className="button secondary small"
                            disabled={busy}
                            onClick={() =>
                              action(
                                "packages/" + r.id,
                                { active: !r.active },
                                "PATCH",
                              )
                            }
                          >
                            {r.active ? "Unpublish" : "Publish"}
                          </button>
                        )}
                        {tab === "senders" && (
                          <button
                            className="button secondary small"
                            onClick={() => {
                              setError(null);
                              setReviewing(r);
                            }}
                          >
                            Review / submit to Kilakona
                          </button>
                        )}
                        {tab === "payments" && r.status === "pending" && r.method !== "clickpesa" && (
                          <button
                            className="button small"
                            disabled={busy}
                            onClick={() => setReviewingOrder(r)}
                          >
                            Review payment
                          </button>
                        )}
                        {tab === "organizations" && (
                          <button
                            className="button secondary small"
                            disabled={busy}
                            onClick={() =>
                              action(
                                "organizations/" + r.id,
                                {
                                  status:
                                    r.status === "active"
                                      ? "suspended"
                                      : "active",
                                },
                                "PATCH",
                              )
                            }
                          >
                            {r.status === "active" ? "Suspend" : "Activate"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title={"No " + tab + " yet"} />
          )}
          <Pagination
            page={page}
            setPage={setPage}
            hasMore={query.data?.data.length === 50}
          />
        </section>
      </main>
      {reviewing && (
        <SenderReview
          sender={reviewing}
          busy={busy}
          error={error}
          onClose={() => setReviewing(null)}
          onSave={async (body) => {
            const r = await action("senders/" + reviewing.id, body, "PATCH");
            if (r) setReviewing(null);
            return r;
          }}
        />
      )}
      {reviewingOrder && (
        <OrderDetail
          id={reviewingOrder.id}
          admin
          onClose={() => setReviewingOrder(null)}
        />
      )}
      {editing && (
        <Modal
          title={
            editing._type === "packages"
              ? "Edit SMS package"
              : "Provider pricing & thresholds"
          }
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const b: any = Object.fromEntries(new FormData(e.currentTarget));
              if (editing._type === "packages")
                b.sms_units = Number(b.sms_units);
              else {
                for (const key of [
                  "warning_threshold",
                  "critical_threshold",
                  "reserve_threshold",
                ])
                  b[key] = Number(b[key]);
                b.cost_per_unit = b.cost_per_unit || null;
                b.currency = b.currency || null;
              }
              const result = await action(
                editing._type + "/" + editing.id,
                b,
                "PATCH",
              );
              if (result) setEditing(null);
            }}
          >
            <ErrorBox error={error} />
            {editing._type === "packages" ? (
              <>
                <label>
                  Name
                  <input name="name" defaultValue={editing.name} required />
                </label>
                <label>
                  SMS units
                  <input
                    type="number"
                    name="sms_units"
                    min="1"
                    defaultValue={editing.sms_units}
                    required
                  />
                </label>
                <label>
                  Selling price
                  <input
                    name="selling_price"
                    inputMode="decimal"
                    defaultValue={editing.selling_price}
                    required
                  />
                </label>
              </>
            ) : (
              <>
                <div className="notice">
                  Leave wholesale cost blank until the commercial agreement is
                  confirmed.
                </div>
                <label>
                  Cost per SMS
                  <input
                    name="cost_per_unit"
                    inputMode="decimal"
                    defaultValue={editing.cost_per_unit ?? ""}
                  />
                </label>
                <label>
                  Currency
                  <input
                    name="currency"
                    maxLength={3}
                    defaultValue={editing.currency ?? ""}
                  />
                </label>
                {[
                  "warning_threshold",
                  "critical_threshold",
                  "reserve_threshold",
                ].map((key) => (
                  <label key={key}>
                    {key.replaceAll("_", " ")}
                    <input
                      type="number"
                      name={key}
                      defaultValue={editing[key]}
                      min="0"
                      required
                    />
                  </label>
                ))}
              </>
            )}
            <button className="button" disabled={busy}>
              Save changes
            </button>
          </form>
        </Modal>
      )}
      {modal && (
        <Modal
          title={
            modal === "credit"
              ? "Adjust customer SMS wallet"
              : "Create SMS package"
          }
          onClose={() => setModal("")}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const b: any = Object.fromEntries(f);
              if (modal === "credit") {
                b.units = Number(b.units);
                await action("credit", b);
              } else {
                b.sms_units = Number(b.sms_units);
                await action("packages", b);
              }
            }}
          >
            <ErrorBox error={error} />
            {modal === "credit" ? (
              <>
                <div className="notice">
                  Every adjustment creates an immutable ledger entry and audit
                  record. Use negative units for a debit. Keep the same
                  reference when retrying.
                </div>
                <label>
                  Organization
                  <select name="organization_id" required>
                    <option value="">Select organization</option>
                    {organizations.data?.data.map((o: any) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  SMS units
                  <input
                    name="units"
                    type="number"
                    step="1"
                    required
                    placeholder="1000"
                  />
                </label>
                <label>
                  Payment / adjustment reference
                  <input name="reference" required minLength={3} />
                </label>
                <label>
                  Reason and notes
                  <textarea name="reason" required minLength={3} />
                </label>
              </>
            ) : (
              <>
                <label>
                  Package name
                  <input name="name" required />
                </label>
                <label>
                  Description
                  <input name="description" />
                </label>
                <label>
                  SMS units
                  <input
                    name="sms_units"
                    type="number"
                    min="1"
                    step="1"
                    required
                  />
                </label>
                <label>
                  Selling price
                  <input
                    name="selling_price"
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]+(\.[0-9]{1,2})?"
                    required
                  />
                </label>
                <label>
                  Currency
                  <input
                    name="currency"
                    defaultValue="TZS"
                    minLength={3}
                    maxLength={3}
                    required
                  />
                </label>
              </>
            )}
            <button className="button" disabled={busy}>
              {busy
                ? "Saving…"
                : modal === "credit"
                  ? "Record wallet adjustment"
                  : "Publish package"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
