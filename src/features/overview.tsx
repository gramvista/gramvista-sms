import { RetailPurchase } from "./retail";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Send,
  Wallet,
  CheckCheck,
  Clock3,
  ChevronRight,
  ShieldCheck,
  Users,
  Code2,
  CalendarDays,
  Download,
  Activity,
} from "lucide-react";
import { api, apiBase } from "../lib/api";
import { useWorkspace } from "../app/App";
import {
  PageTitle,
  number,
  Empty,
  Badge,
  date,
  Modal,
  ErrorBox,
  Copy,
} from "../components/ui";
export function Dashboard() {
  const session = useWorkspace();
  const wallet = useQuery({
    queryKey: ["balance"],
    queryFn: () => api("balance"),
  });
  const campaigns = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => api("campaigns"),
    refetchInterval: 10000,
  });
  const stats = useQuery({
    queryKey: ["stats"],
    queryFn: () => api("stats"),
    refetchInterval: 10000,
  });
  const senders = useQuery({
    queryKey: ["sender-ids"],
    queryFn: () => api("sender-ids"),
  });
  const transactions = useQuery({
    queryKey: ["transactions"],
    queryFn: () => api("transactions"),
  });
  const s = stats.data ?? {};
  const steps = [
    [
      "Request a Sender ID",
      "Your brand, in every inbox.",
      "/sender-ids",
      ShieldCheck,
      Boolean(senders.data?.data.some((r: any) => r.status === "approved")),
    ],
    [
      "Add SMS credits",
      "Choose the right package for you.",
      "/buy",
      Wallet,
      Number(wallet.data?.total_sms) > 0,
    ],
    [
      "Build your audience",
      "Bring your contacts together.",
      "/contacts",
      Users,
      Number(s.contacts) > 0,
    ],
    [
      "Send your first message",
      "Make your next connection.",
      "/send",
      Send,
      Number(s.total) > 0,
    ],
  ] as const;
  return (
    <>
      <PageTitle
        eyebrow="YOUR MESSAGING AT A GLANCE"
        title={"Welcome back, " + session.organization.name + "."}
        description="A little message can make a big difference. Here’s how yours are doing."
        action={
          <>
            <button
              className="button secondary"
              onClick={() => {
                const blob = new Blob([JSON.stringify(s, null, 2)], {
                  type: "application/json",
                });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = "gramvista-overview.json";
                a.click();
                URL.revokeObjectURL(a.href);
              }}
            >
              <Download size={16} />
              Export overview
            </button>
            <Link className="button" to="/send">
              <Plus size={18} />
              Send SMS
            </Link>
          </>
        }
      />
      <ErrorBox error={stats.error || wallet.error} />
      <div className="metrics">
        <div className="metric balance-metric">
          <div className="metric-top">
            <span>Available SMS balance</span>
            <Wallet size={20} />
          </div>
          <strong>
            {number(wallet.data?.available_sms)}
            <small> SMS</small>
          </strong>
          <div className="metric-bottom">
            <span>{number(wallet.data?.reserved_sms)} reserved</span>
            <Link to="/buy">
              Buy SMS <ArrowUpRight size={15} />
            </Link>
          </div>
        </div>
        <Metric
          label="Messages this month"
          value={number(s.month)}
          icon={<Send size={20} />}
          detail={`${number(s.today)} messages today`}
          color="blue"
        />
        <Metric
          label="Delivery rate"
          value={
            s.total
              ? `${Number((s.delivered / s.total) * 100).toFixed(1)}%`
              : "—"
          }
          icon={<CheckCheck size={21} />}
          detail={`${number(s.delivered)} successfully delivered`}
          color="green"
        />
        <Metric
          label="Awaiting delivery"
          value={number(s.pending)}
          icon={<Clock3 size={20} />}
          detail={`${number(s.failed)} failed messages`}
          color="amber"
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel usage-panel">
          <div className="panel-heading">
            <div>
              <h2>Message activity</h2>
              <p>Your connections, day by day</p>
            </div>
            <span className="date-pill">
              <CalendarDays size={14} />
              Last 7 days
            </span>
          </div>
          <div className="chart-key">
            <span>
              <i className="blue-dot" />
              Messages
            </span>
            <span>
              <i className="green-dot" />
              Delivered
            </span>
          </div>
          <div className="activity-chart">
            <div className="chart-y">
              <span>
                {number(
                  Math.max(
                    ...(s.days ?? []).map((d: any) => Number(d.total)),
                    10,
                  ),
                )}
              </span>
              <span>
                {number(
                  Math.max(
                    ...(s.days ?? []).map((d: any) => Number(d.total)),
                    10,
                  ) / 2,
                )}
              </span>
              <span>0</span>
            </div>
            <div className="chart-plot">
              <div className="chart-grid-lines">
                <i />
                <i />
                <i />
              </div>
              {(
                s.days ??
                Array.from({ length: 7 }, (_, i) => ({
                  day: new Date(Date.now() - (6 - i) * 86400000).toISOString(),
                  total: 0,
                  delivered: 0,
                }))
              ).map((d: any, i: number) => (
                <div className="chart-column" key={i}>
                  <div className="bars">
                    <div
                      className="bar sent"
                      title={`${d.total} messages`}
                      style={{
                        height: `${Math.max(2, (Number(d.total) / Math.max(...(s.days ?? []).map((v: any) => Number(v.total)), 10)) * 150)}px`,
                      }}
                    />
                    <div
                      className="bar delivered"
                      title={`${d.delivered} delivered`}
                      style={{
                        height: `${Math.max(2, (Number(d.delivered) / Math.max(...(s.days ?? []).map((v: any) => Number(v.total)), 10)) * 150)}px`,
                      }}
                    />
                  </div>
                  <span>
                    {new Date(d.day).toLocaleDateString("en", {
                      weekday: "short",
                      timeZone: session.organization.timezone,
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="chart-summary">
            <span>
              <strong>{number(s.total)}</strong> all-time messages
            </span>
            <Link to="/reports">
              View delivery reports <ArrowRight size={15} />
            </Link>
          </div>
        </section>
        <section className="panel delivery-panel">
          <div className="panel-heading">
            <div>
              <h2>Delivery overview</h2>
              <p>Every message accounted for</p>
            </div>
            <Activity size={19} />
          </div>
          <div
            className="donut"
            style={{
              background: `conic-gradient(#19ad88 0 ${s.total ? (100 * s.delivered) / s.total : 0}%, #f0b34b 0 ${s.total ? (100 * (s.delivered + s.pending)) / s.total : 0}%, #ef7180 0 ${s.total ? 100 : 0}%, #edf1f6 0)`,
            }}
          >
            <div>
              <strong>{number(s.total)}</strong>
              <span>Total messages</span>
            </div>
          </div>
          <div className="delivery-legend">
            {[
              ["Delivered", s.delivered, "green"],
              ["Pending", s.pending, "amber"],
              ["Failed", s.failed, "red"],
            ].map(([label, count, color]) => (
              <div key={String(label)}>
                <span>
                  <i className={color + "-dot"} />
                  {label}
                </span>
                <strong>{number(count)}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>
      {!steps.every((s) => s[4]) && (
        <section className="panel getting-started">
          <div className="panel-heading">
            <div>
              <h2>Let’s get your business messaging</h2>
              <p>Four simple steps to your first connection.</p>
            </div>
            <span className="badge pending">
              {steps.filter((s) => s[4]).length} of 4 complete
            </span>
          </div>
          <div className="steps">
            {steps.map(([title, desc, to, Icon, done], i) => (
              <Link
                to={to}
                key={title}
                className={"step " + (done ? "done" : "")}
              >
                <span className="step-number">
                  {done ? <CheckCheck size={16} /> : i + 1}
                </span>
                <Icon size={21} />
                <strong>{title}</strong>
                <span>{desc}</span>
                <ChevronRight size={16} className="step-arrow" />
              </Link>
            ))}
          </div>
        </section>
      )}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Recent campaigns</h2>
            <p>Your latest conversations at scale</p>
          </div>
          <Link className="text-link" to="/campaigns">
            View all campaigns <ArrowRight size={16} />
          </Link>
        </div>
        {campaigns.data?.data.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Recipients</th>
                  <th>Estimated units</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.data.data.slice(0, 5).map((c: any) => (
                  <tr key={c.id}>
                    <td>
                      <Link to="/campaigns" className="cell-title">
                        {c.name}
                      </Link>
                      <small>{c.campaign_reference.slice(0, 20)}…</small>
                    </td>
                    <td>{number(c.eligible_count)}</td>
                    <td>{number(c.estimated_units)}</td>
                    <td>
                      <Badge status={c.status} />
                    </td>
                    <td>{date(c.created_at, session.organization.timezone)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Your next connection starts here"
            description="Create your first campaign and bring your audience a little closer."
            action={
              <Link className="button secondary small" to="/send">
                Create a campaign <ArrowRight size={15} />
              </Link>
            }
          />
        )}
      </section>
      <div className="dashboard-bottom">
        <section className="panel">
          <div className="panel-heading">
            <h2>Recent transactions</h2>
            <Link className="text-link" to="/transactions">
              View all <ArrowRight size={15} />
            </Link>
          </div>
          {transactions.data?.data.length ? (
            <div className="transaction-list">
              {transactions.data.data.slice(0, 3).map((t: any) => (
                <div key={t.id}>
                  <span className="transaction-icon">
                    <Wallet size={18} />
                  </span>
                  <div>
                    <strong>{t.description}</strong>
                    <small>{date(t.created_at)}</small>
                  </div>
                  <b>
                    {t.direction === "credit"
                      ? "+"
                      : t.direction === "debit"
                        ? "−"
                        : ""}
                    {number(t.units)} SMS
                  </b>
                </div>
              ))}
            </div>
          ) : (
            <div className="quiet-empty">
              No transactions yet. Your wallet history will appear here.
            </div>
          )}
        </section>
        <section className="developer-callout">
          <span className="code-icon">
            <Code2 size={25} />
          </span>
          <div>
            <span className="eyebrow">BUILT FOR YOUR BUSINESS</span>
            <h2>Your systems. Our messaging.</h2>
            <p>Connect your app to Gramvista’s simple, reliable API.</p>
            <Link to="/developers">
              Explore developer tools <ArrowUpRight size={16} />
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
function Metric({
  label,
  value,
  icon,
  detail,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  detail: string;
  color: string;
}) {
  return (
    <div className="metric">
      <div className="metric-top">
        <span>{label}</span>
        <span className={"metric-icon " + color}>{icon}</span>
      </div>
      <strong>{value}</strong>
      <div className="metric-bottom">
        <span>{detail}</span>
      </div>
    </div>
  );
}
export function WalletPage({ buy = false }: { buy?: boolean }) {
  const client = useQueryClient();
  const balance = useQuery({
    queryKey: ["balance"],
    queryFn: () => api("balance"),
  });
  const packages = useQuery({
    queryKey: ["packages"],
    queryFn: () => api("packages"),
  });
  const payments = useQuery({
    queryKey: ["payments"],
    queryFn: () => api("payments"),
  });
  const [selected, setSelected] = useState<any>(null);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  return (
    <>
      <PageTitle
        eyebrow="KEEP THE CONVERSATION GOING"
        title={buy ? "Buy SMS" : "Your SMS wallet"}
        description="Simple credits. Clear accounting. Every SMS unit in one place."
      />
      {!buy && (
        <div className="metrics three">
          <Metric
            label="Available SMS"
            value={number(balance.data?.available_sms)}
            icon={<Wallet />}
            detail="Ready for your next campaign"
            color="blue"
          />
          <Metric
            label="Reserved SMS"
            value={number(balance.data?.reserved_sms)}
            icon={<Clock3 />}
            detail="Set aside for queued campaigns"
            color="amber"
          />
          <Metric
            label="Total SMS"
            value={number(balance.data?.total_sms)}
            icon={<CheckCheck />}
            detail="Available + reserved units"
            color="green"
          />
        </div>
      )}
      <RetailPurchase />
      {Boolean(packages.data?.data.length) && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Additional SMS packages</h2>
              <p>Credits are added after Gramvista verifies your payment.</p>
            </div>
            <Badge status="manual verification" />
          </div>
          <ErrorBox error={packages.error} />
          {packages.data?.data.length ? (
            <div className="packages">
              {packages.data.data.map((p: any) => (
                <div className="package" key={p.id}>
                  <span className="eyebrow">{p.name}</span>
                  <h2>
                    {number(p.sms_units)} <small>SMS</small>
                  </h2>
                  <p>{p.description}</p>
                  <strong>
                    {p.currency} {p.selling_price}
                  </strong>
                  <button
                    className="button"
                    onClick={() => {
                      setError(null);
                      setSelected(p);
                    }}
                  >
                    Choose package <ArrowRight size={16} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="Packages are being prepared"
              description="Gramvista administration will publish available packages and pricing here."
            />
          )}
        </section>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>Payment requests</h2>
          <Link to="/transactions">View wallet ledger</Link>
        </div>
        {payments.data?.data.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>SMS units</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.data.data.map((p: any) => (
                  <tr key={p.id}>
                    <td>{p.reference}</td>
                    <td>{number(p.sms_units)}</td>
                    <td>
                      {p.currency} {p.amount}
                    </td>
                    <td>
                      <Badge status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No payments yet" />
        )}
      </section>
      {selected && (
        <Modal title={"Buy " + selected.name} onClose={() => setSelected(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api("payments", {
                  method: "POST",
                  body: {
                    package_id: selected.id,
                    reference: new FormData(e.currentTarget).get("reference"),
                  },
                });
                setSelected(null);
                await client.invalidateQueries({ queryKey: ["payments"] });
              } catch (err) {
                setError(err);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="notice">
              Contact Gramvista support for verified payment instructions before
              paying. Submit your payment reference below for manual
              verification. Credits are added only after approval.
            </div>
            <p>
              <strong>
                {number(selected.sms_units)} SMS · {selected.currency}{" "}
                {selected.selling_price}
              </strong>
            </p>
            <ErrorBox error={error} />
            <label>
              Payment reference
              <input
                name="reference"
                required
                minLength={3}
                placeholder="Bank or mobile money reference"
              />
            </label>
            <button className="button" disabled={busy}>
              Submit for verification
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function DeveloperPage() {
  const client = useQueryClient();
  const keys = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => api("api-keys"),
  });
  const [modal, setModal] = useState(false);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const code = `curl -X POST https://sscleaiwktklkuxqqndf.supabase.co/functions/v1/public-api/v1/messages \\\n  -H "Authorization: Bearer YOUR_GRAMVISTA_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -H "Idempotency-Key: order-12882" \\\n  -d '{"sender_id":"YOURBRAND","recipients":["+255712345678"],"message":"Your order is ready."}'`;
  return (
    <>
      <PageTitle
        eyebrow="BUILT TO CONNECT"
        title="API & developers"
        description="Bring Gramvista messaging into your applications, including Mteja Connect."
        action={
          <button
            className="button"
            onClick={() => {
              setError(null);
              setModal(true);
            }}
          >
            <Plus size={17} />
            Create API key
          </button>
        }
      />
      <ErrorBox error={error || keys.error} />
      <section className="panel">
        <div className="panel-heading">
          <h2>Your API keys</h2>
          <span className="muted">Full keys are shown only once</span>
        </div>
        {keys.data?.data.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Key prefix</th>
                  <th>Environment</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {keys.data.data.map((k: any) => (
                  <tr key={k.id}>
                    <td>{k.name}</td>
                    <td>
                      <code>{k.key_prefix}…</code>
                    </td>
                    <td>
                      <Badge status={k.environment} />
                    </td>
                    <td>
                      <Badge status={k.revoked_at ? "revoked" : "active"} />
                    </td>
                    <td>
                      {!k.revoked_at && (
                        <button
                          className="button secondary small"
                          onClick={async () => {
                            try {
                              await api("api-keys/" + k.id, {
                                method: "DELETE",
                              });
                              await client.invalidateQueries({
                                queryKey: ["api-keys"],
                              });
                            } catch (e) {
                              setError(e);
                            }
                          }}
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Connect with your first API key"
            description="Start with a test key to simulate delivery without spending credits."
          />
        )}
      </section>
      <div className="dashboard-grid">
        <section className="panel documentation">
          <h2>Send your first message</h2>
          <p>
            Authenticate with a Bearer key. Use a new idempotency key for each
            distinct send; retain it when retrying.
          </p>
          <pre>{code}</pre>
          <Copy value={code} />
          <div className="notice">
            Test keys always simulate delivery and consume no SMS credits. Live
            keys use your organization’s wallet and approved Sender IDs.
          </div>
          <h3>Local API base</h3>
          <code>{apiBase}/v1</code>
          <h3>Delivery webhooks</h3>
          <p>
            Events are signed with HMAC SHA-256. Verify{" "}
            <code>X-Gramvista-Signature</code> against{" "}
            <code>timestamp + '.' + rawBody</code>. Reject stale timestamps and
            deduplicate event IDs.
          </p>
          <Link to="/webhooks" className="button secondary">
            Manage webhooks <ArrowRight size={16} />
          </Link>
        </section>
        <section className="panel documentation">
          <h2>API reference</h2>
          {[
            ["POST", "/v1/messages", "Queue SMS messages"],
            ["GET", "/v1/messages/{id}", "Read normalized delivery status"],
            ["POST", "/v1/campaigns", "Queue or schedule a campaign"],
            [
              "GET",
              "/v1/campaigns/{id}/messages",
              "Paginated campaign recipients",
            ],
            ["GET", "/v1/balance", "Your customer SMS wallet"],
            ["GET", "/v1/transactions", "Immutable wallet history"],
            ["GET", "/v1/sender-ids", "Your Sender IDs"],
            ["POST", "/v1/sender-ids", "Request a Sender ID"],
          ].map(([method, path, desc]) => (
            <div className="endpoint" key={method + path}>
              <span className={"method " + method}>{method}</span>
              <div>
                <code>{path}</code>
                <small>{desc}</small>
              </div>
            </div>
          ))}
          <h3>Predictable errors</h3>
          <p>
            Responses include a request ID. Common errors include{" "}
            <code>INSUFFICIENT_SMS_BALANCE</code>,{" "}
            <code>SENDER_ID_NOT_APPROVED</code>, and <code>RATE_LIMITED</code>.
          </p>
        </section>
      </div>
      {modal && (
        <Modal title="Create API key" onClose={() => setModal(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const f = new FormData(e.currentTarget);
              try {
                const result = await api("api-keys", {
                  method: "POST",
                  body: {
                    name: f.get("name"),
                    environment: f.get("environment"),
                    permissions: f.getAll("permissions"),
                    expires_at: f.get("expires")
                      ? new Date(String(f.get("expires"))).toISOString()
                      : null,
                  },
                });
                setRaw(result.key);
                setModal(false);
                await client.invalidateQueries({ queryKey: ["api-keys"] });
              } catch (e) {
                setError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            <ErrorBox error={error} />
            <label>
              Key name
              <input name="name" required placeholder="Mteja Connect" />
            </label>
            <label>
              Environment
              <select name="environment">
                <option value="test">Test — no charges</option>
                <option value="live">Live — wallet credits required</option>
              </select>
            </label>
            <label>
              Expiry (optional)
              <input name="expires" type="datetime-local" />
            </label>
            <fieldset>
              <legend>Permissions</legend>
              {[
                "messages.send",
                "messages.read",
                "campaigns.send",
                "campaigns.read",
                "wallet.read",
                "transactions.read",
                "sender_ids.read",
                "sender_ids.request",
              ].map((p) => (
                <label className="check-label" key={p}>
                  <input
                    type="checkbox"
                    name="permissions"
                    value={p}
                    defaultChecked={[
                      "messages.send",
                      "messages.read",
                      "wallet.read",
                      "sender_ids.read",
                    ].includes(p)}
                  />
                  {p}
                </label>
              ))}
            </fieldset>
            <button className="button" disabled={busy}>
              Generate key
            </button>
          </form>
        </Modal>
      )}
      {raw && (
        <Modal title="Save your new API key" onClose={() => setRaw("")}>
          <div className="notice">
            Copy this key now. It cannot be retrieved again.
          </div>
          <pre className="secret">{raw}</pre>
          <Copy value={raw} />
          <button className="button" onClick={() => setRaw("")}>
            I’ve saved my key
          </button>
        </Modal>
      )}
    </>
  );
}
export function SettingsPage() {
  const session = useWorkspace();
  const client = useQueryClient();
  const [error, setError] = useState<unknown>();
  const [saved, setSaved] = useState(false);
  return (
    <>
      <PageTitle
        title="Workspace settings"
        description="Your organization details and messaging preferences."
      />
      <form
        className="panel settings-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaved(false);
          const f = new FormData(e.currentTarget);
          try {
            await api("settings", {
              method: "PATCH",
              body: {
                name: f.get("name"),
                timezone: f.get("timezone"),
                quiet_start: Number(f.get("quiet_start")),
                quiet_end: Number(f.get("quiet_end")),
                quiet_hours_enabled: f.get("quiet_hours_enabled") === "on",
              },
            });
            setSaved(true);
            await client.invalidateQueries({ queryKey: ["session"] });
          } catch (err) {
            setError(err);
          }
        }}
      >
        <h2>Organization</h2>
        <ErrorBox error={error} />
        {saved && <div className="notice success">Settings saved.</div>}
        <label>
          Business name
          <input
            name="name"
            required
            defaultValue={session.organization.name}
          />
        </label>
        <label>
          Display timezone
          <input
            name="timezone"
            required
            defaultValue={session.organization.timezone}
          />
        </label>
        <h3>Optional quiet hours</h3>
        <label className="check-label">
          <input
            name="quiet_hours_enabled"
            type="checkbox"
            defaultChecked={session.organization.quiet_hours_enabled === true}
          />
          Pause scheduled messages during selected hours
        </label>
        <p>Leave this off to send messages at any time.</p>
        <div className="form-grid">
          <label>
            Start hour (0–23)
            <input
              name="quiet_start"
              type="number"
              min="0"
              max="23"
              defaultValue={session.organization.quiet_start}
            />
          </label>
          <label>
            End hour (0–23)
            <input
              name="quiet_end"
              type="number"
              min="0"
              max="23"
              defaultValue={session.organization.quiet_end}
            />
          </label>
        </div>
        <button className="button">Save settings</button>
      </form>
    </>
  );
}
