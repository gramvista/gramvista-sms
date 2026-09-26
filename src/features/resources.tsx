import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import Papa from "papaparse";
import {
  Plus,
  Search,
  Upload,
  Download,
  ArrowRight,
  Trash2,
} from "lucide-react";
import { api, supabase } from "../lib/api";
import { useWorkspace } from "../app/App";
import {
  PageTitle,
  Empty,
  Badge,
  Modal,
  ErrorBox,
  Pagination,
  date,
  Copy,
} from "../components/ui";
import { normalizePhone } from "../../shared/sms";
type Field = {
  key: string;
  label: string;
  type?: string;
  options?: string[];
  required?: boolean;
};
type Config = {
  resource: string;
  title: string;
  description: string;
  singular: string;
  columns: [string, string][];
  fields?: Field[];
};
export const resourceConfigs: Record<string, Config> = {
  contacts: {
    resource: "contacts",
    title: "Your contacts",
    singular: "contact",
    description:
      "Real people. Meaningful connections. Keep your audience organized.",
    columns: [
      ["first_name", "First name"],
      ["last_name", "Last name"],
      ["normalized_phone", "Phone"],
      ["email", "Email"],
      ["status", "Status"],
    ],
    fields: [
      { key: "first_name", label: "First name" },
      { key: "last_name", label: "Last name", required: false },
      { key: "phone", label: "Phone number" },
      { key: "email", label: "Email", type: "email", required: false },
    ],
  },
  groups: {
    resource: "groups",
    title: "Contact groups",
    singular: "group",
    description: "Bring the right audience together for every message.",
    columns: [
      ["name", "Group name"],
      ["description", "Description"],
      ["created_at", "Created"],
    ],
    fields: [
      { key: "name", label: "Group name" },
      { key: "description", label: "Description", required: false },
    ],
  },
  suppression: {
    resource: "suppression",
    title: "Suppression list",
    singular: "suppression",
    description:
      "These recipients are automatically excluded from your campaigns.",
    columns: [
      ["normalized_phone", "Phone"],
      ["reason", "Reason"],
      ["created_at", "Added"],
    ],
    fields: [
      { key: "phone", label: "Phone number" },
      {
        key: "reason",
        label: "Reason",
        options: [
          "opt_out",
          "complaint",
          "invalid",
          "do_not_contact",
          "manual",
          "other",
        ],
      },
    ],
  },
  "sender-ids": {
    resource: "sender-ids",
    title: "Sender IDs",
    singular: "Sender ID request",
    description: "Put your business name at the start of every conversation.",
    columns: [
      ["sender_name", "Sender ID"],
      ["legal_business_name", "Business"],
      ["purpose", "Purpose"],
      ["status", "Approval status"],
      ["created_at", "Requested"],
    ],
    fields: [
      {
        key: "sender_name",
        label: "Sender name (1–11 letters, numbers or spaces)",
      },
      { key: "legal_business_name", label: "Legal business name" },
      { key: "purpose", label: "Messaging purpose", type: "textarea" },
      { key: "sample_message", label: "Sample message", type: "textarea" },
      { key: "contact_name", label: "Contact name" },
      { key: "contact_phone", label: "Contact phone" },
      { key: "contact_email", label: "Contact email", type: "email" },
    ],
  },
  campaigns: {
    resource: "campaigns",
    title: "Campaigns",
    singular: "campaign",
    description: "Thoughtful messages. The right audience. All in one place.",
    columns: [
      ["name", "Campaign"],
      ["eligible_count", "Recipients"],
      ["estimated_units", "Estimated SMS"],
      ["status", "Status"],
      ["created_at", "Created"],
    ],
  },
  messages: {
    resource: "messages",
    title: "Message history",
    singular: "message",
    description: "Track every message from submission to delivery.",
    columns: [
      ["message_reference", "Message reference"],
      ["normalized_phone", "Recipient"],
      ["message_snapshot", "Message"],
      ["status", "Delivery"],
      ["billing_status", "Billing"],
      ["sent_at", "Sent at"],
    ],
  },
  transactions: {
    resource: "transactions",
    title: "Transactions",
    singular: "transaction",
    description: "A complete, immutable record of your SMS wallet activity.",
    columns: [
      ["description", "Description"],
      ["type", "Type"],
      ["units", "Units"],
      ["direction", "Direction"],
      ["balance_after", "Balance after"],
      ["created_at", "Date"],
    ],
  },
  templates: {
    resource: "templates",
    title: "Message templates",
    singular: "template",
    description: "Save the messages that keep your business moving.",
    columns: [
      ["name", "Template"],
      ["category", "Category"],
      ["message", "Message"],
      ["created_at", "Created"],
    ],
    fields: [
      { key: "name", label: "Template name" },
      {
        key: "category",
        label: "Category",
        options: [
          "notification",
          "promotion",
          "reminder",
          "otp",
          "transactional",
          "custom",
        ],
      },
      { key: "message", label: "Message", type: "textarea" },
    ],
  },
  webhooks: {
    resource: "webhooks",
    title: "Webhooks",
    singular: "webhook",
    description: "Get signed delivery events directly in your application.",
    columns: [
      ["url", "Endpoint URL"],
      ["events", "Events"],
      ["active", "Active"],
      ["created_at", "Created"],
    ],
    fields: [{ key: "url", label: "HTTPS endpoint URL", type: "url" }],
  },
  team: {
    resource: "team",
    title: "Your team",
    singular: "team member",
    description: "Keep your team connected with the right level of access.",
    columns: [
      ["user_id", "User ID"],
      ["role_id", "Role"],
      ["status", "Status"],
      ["joined_at", "Joined"],
    ],
  },
};
export function ResourcePage({
  config,
  reports = false,
}: {
  config: Config;
  reports?: boolean;
}) {
  const client = useQueryClient();
  const session = useWorkspace();
  const [params] = useSearchParams();
  const campaign = params.get("campaign_id");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("all");
  const query = useQuery({
    queryKey: [config.resource, page, campaign],
    queryFn: () =>
      api(
        config.resource +
          "?page=" +
          page +
          (config.resource === "messages" && campaign
            ? "&campaign_id=" + encodeURIComponent(campaign)
            : ""),
      ),
    refetchInterval: ["campaigns", "messages"].includes(config.resource)
      ? 5000
      : false,
  });
  const rows = (query.data?.data ?? []).filter(
    (r: any) =>
      (status === "all" || r.status === status) &&
      Object.values(r).some((v) =>
        String(v).toLowerCase().includes(search.toLowerCase()),
      ),
  );
  const invalidate = () =>
    client.invalidateQueries({ queryKey: [config.resource] });
  return (
    <>
      <PageTitle
        eyebrow={reports ? "EVERY MESSAGE ACCOUNTED FOR" : undefined}
        title={reports ? "Delivery reports" : config.title}
        description={config.description}
        action={
          <>
            {config.resource === "contacts" && (
              <button
                className="button secondary"
                onClick={() => setImporting(true)}
              >
                <Upload size={16} />
                Import CSV
              </button>
            )}
            {config.fields ? (
              <button
                className="button"
                onClick={() => {
                  setError(null);
                  setModal(true);
                }}
              >
                <Plus size={17} />
                {config.resource === "sender-ids"
                  ? "Request Sender ID"
                  : "Add " + config.singular}
              </button>
            ) : config.resource === "campaigns" ? (
              <Link to="/campaigns/new" className="button">
                <Plus size={17} />
                New campaign
              </Link>
            ) : null}
          </>
        }
      />
      {config.resource === "contacts" && (
        <div className="tabs">
          <Link className="selected" to="/contacts">
            Contacts
          </Link>
          <Link to="/groups">Groups</Link>
          <Link to="/suppression">Suppression list</Link>
        </div>
      )}
      {config.resource === "sender-ids" && (
        <div className="notice">
          Sender IDs are reviewed by Gramvista. Only approved Sender IDs can
          send messages. Business documents are stored privately.
        </div>
      )}
      {config.resource === "webhooks" && (
        <div className="notice">
          Endpoint hosts must be allowlisted by Gramvista before registration.
          Delivery uses HMAC signatures and bounded retries.
        </div>
      )}
      {config.resource === "team" && <TeamInvitations />}
      <ErrorBox error={error || query.error} />
      <section className="panel">
        <div className="table-toolbar">
          <div className="search-field">
            <Search size={17} />
            <input
              aria-label="Search this page"
              placeholder={"Search " + config.resource + " on this page…"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            {["messages", "campaigns", "sender-ids"].includes(
              config.resource,
            ) && (
              <select
                aria-label="Filter status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">All statuses</option>
                {(config.resource === "messages"
                  ? ["queued", "submitted", "delivered", "pending", "failed"]
                  : config.resource === "campaigns"
                    ? [
                        "queued",
                        "scheduled",
                        "processing",
                        "completed",
                        "partially_completed",
                        "cancelled",
                      ]
                    : ["submitted", "provider_pending", "approved", "rejected"]
                ).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            )}
            <button
              className="button secondary small"
              onClick={() => {
                const csv = Papa.unparse(rows);
                const blob = new Blob(["\ufeff" + csv], {
                  type: "text/csv;charset=utf-8;",
                });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = config.resource + "-page-" + page + ".csv";
                a.click();
                URL.revokeObjectURL(a.href);
              }}
            >
              <Download size={15} />
              Export page
            </button>
          </div>
        </div>
        {query.isLoading ? (
          <div className="quiet-empty">Loading…</div>
        ) : rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {config.columns.map(([key, label]) => (
                    <th key={key}>{label}</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.id}>
                    {config.columns.map(([key], i) => (
                      <td key={key} className={i === 0 ? "cell-title" : ""}>
                        {key.includes("status") ? (
                          <Badge status={r[key]} />
                        ) : key.endsWith("_at") ? (
                          date(r[key], session.organization.timezone)
                        ) : typeof r[key] === "boolean" ? (
                          r[key] ? (
                            "Yes"
                          ) : (
                            "No"
                          )
                        ) : Array.isArray(r[key]) ? (
                          r[key].join(", ")
                        ) : (
                          <span
                            className="truncate"
                            title={String(r[key] ?? "")}
                          >
                            {String(r[key] ?? "—")}
                          </span>
                        )}
                      </td>
                    ))}
                    <td>
                      <button
                        className="icon-button"
                        aria-label={"View " + config.singular}
                        onClick={() => setDetail(r)}
                      >
                        <ArrowRight size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={
              search || status !== "all"
                ? "No matching results"
                : "No " + config.resource.replaceAll("-", " ") + " yet"
            }
            description={
              config.resource === "sender-ids"
                ? "Request a Sender ID to start sending branded messages."
                : config.resource === "campaigns"
                  ? "Your first campaign is the start of something great."
                  : "Add your first " + config.singular + " to get started."
            }
          />
        )}
        <Pagination
          page={page}
          setPage={setPage}
          hasMore={Boolean(query.data?.has_more)}
        />
      </section>
      {modal && (
        <Modal title={"Add " + config.singular} onClose={() => setModal(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              const f = new FormData(e.currentTarget);
              const body: any = Object.fromEntries(f);
              if (config.resource === "webhooks")
                body.events = f.getAll("events");
              try {
                const result = await api(config.resource, {
                  method: "POST",
                  body,
                });
                if (result.secret) setRaw(result.secret);
                setModal(false);
                await invalidate();
              } catch (err) {
                setError(err);
              } finally {
                setBusy(false);
              }
            }}
          >
            <ErrorBox error={error} />
            {config.fields?.map((f) => (
              <label key={f.key}>
                {f.label}
                {f.options ? (
                  <select name={f.key}>
                    {f.options.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                ) : f.type === "textarea" ? (
                  <textarea
                    name={f.key}
                    required={f.required !== false}
                    rows={4}
                  />
                ) : (
                  <input
                    name={f.key}
                    type={f.type ?? "text"}
                    required={f.required !== false}
                  />
                )}
              </label>
            ))}
            {config.resource === "webhooks" && (
              <fieldset>
                <legend>Subscribe to events</legend>
                {[
                  "message.submitted",
                  "message.delivered",
                  "message.failed",
                  "campaign.completed",
                  "balance.low",
                ].map((event) => (
                  <label className="check-label" key={event}>
                    <input
                      type="checkbox"
                      name="events"
                      value={event}
                      defaultChecked
                    />
                    {event}
                  </label>
                ))}
              </fieldset>
            )}
            <button className="button" disabled={busy}>
              {busy ? "Saving…" : "Save " + config.singular}
            </button>
          </form>
        </Modal>
      )}
      {detail && (
        <Modal
          title={config.singular + " details"}
          onClose={() => setDetail(null)}
        >
          <div className="detail-list">
            {Object.entries(detail)
              .filter(([k]) => !["organization_id", "id"].includes(k))
              .map(([k, v]) => (
                <div key={k}>
                  <span>{k.replaceAll("_", " ")}</span>
                  <strong>
                    {typeof v === "object"
                      ? JSON.stringify(v)
                      : String(v ?? "—")}
                  </strong>
                </div>
              ))}
          </div>
          {config.resource === "campaigns" && (
            <>
              <Link
                className="button secondary"
                to={"/messages?campaign_id=" + detail.id}
                onClick={() => setDetail(null)}
              >
                View messages
              </Link>
              {["queued", "scheduled"].includes(detail.status) && (
                <button
                  className="button danger"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api("campaigns/" + detail.id + "/cancel", {
                        method: "POST",
                      });
                      setDetail(null);
                      await invalidate();
                      await client.invalidateQueries({ queryKey: ["balance"] });
                    } catch (e) {
                      setError(e);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Cancel campaign & release credits
                </button>
              )}
            </>
          )}
          {config.resource === "groups" && <GroupMembers groupId={detail.id} />}{" "}
          {config.resource === "sender-ids" && (
            <DocumentUpload sender={detail} />
          )}{" "}
          {config.resource === "team" && detail.role_id !== "owner" && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await api("team/" + detail.id, {
                    method: "PATCH",
                    body: Object.fromEntries(new FormData(e.currentTarget)),
                  });
                  setDetail(null);
                  await invalidate();
                } catch (e) {
                  setError(e);
                }
              }}
            >
              <label>
                Role
                <select name="role_id" defaultValue={detail.role_id}>
                  {[
                    "administrator",
                    "campaign_manager",
                    "developer",
                    "viewer",
                  ].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select name="status" defaultValue={detail.status}>
                  <option>active</option>
                  <option>inactive</option>
                </select>
              </label>
              <button className="button">Update member</button>
            </form>
          )}
          {["contacts", "templates", "suppression", "webhooks"].includes(
            config.resource,
          ) && (
            <button
              className="button danger"
              onClick={async () => {
                try {
                  await api(config.resource + "/" + detail.id, {
                    method: "DELETE",
                  });
                  setDetail(null);
                  await invalidate();
                } catch (e) {
                  setError(e);
                }
              }}
            >
              <Trash2 size={16} />
              {config.resource === "contacts"
                ? "Archive contact"
                : config.resource === "webhooks"
                  ? "Disable endpoint"
                  : "Remove"}
            </button>
          )}
        </Modal>
      )}
      {importing && (
        <CsvImport onClose={() => setImporting(false)} onDone={invalidate} />
      )}
      {raw && (
        <Modal title="Save your webhook secret" onClose={() => setRaw("")}>
          <p>
            This secret is shown only once. Use it to verify delivery
            signatures.
          </p>
          <pre className="secret">{raw}</pre>
          <Copy value={raw} />
        </Modal>
      )}
    </>
  );
}
function GroupMembers({ groupId }: { groupId: string }) {
  const client = useQueryClient();
  const members = useQuery({
    queryKey: ["group-members"],
    queryFn: () => api("group-members"),
  });
  const contacts = useQuery({
    queryKey: ["contacts"],
    queryFn: () => api("contacts"),
  });
  const [error, setError] = useState<unknown>();
  return (
    <div>
      <h3>Group members</h3>
      <ErrorBox error={error} />
      {members.data?.data
        .filter((m: any) => m.group_id === groupId)
        .map((m: any) => (
          <div className="member-row" key={m.id}>
            <span>
              {contacts.data?.data.find((c: any) => c.id === m.contact_id)
                ?.normalized_phone ?? m.contact_id}
            </span>
            <button
              className="icon-button"
              aria-label="Remove group member"
              onClick={async () => {
                try {
                  await api("group-members/" + m.id, { method: "DELETE" });
                  await client.invalidateQueries({
                    queryKey: ["group-members"],
                  });
                } catch (e) {
                  setError(e);
                }
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api("group-members", {
              method: "POST",
              body: {
                group_id: groupId,
                contact_id: new FormData(e.currentTarget).get("contact_id"),
              },
            });
            await client.invalidateQueries({ queryKey: ["group-members"] });
          } catch (e) {
            setError(e);
          }
        }}
      >
        <label>
          Add a contact
          <select name="contact_id" required>
            <option value="">Select contact</option>
            {contacts.data?.data
              .filter((c: any) => c.status === "active")
              .map((c: any) => (
                <option value={c.id} key={c.id}>
                  {c.first_name} · {c.normalized_phone}
                </option>
              ))}
          </select>
        </label>
        <button className="button">Add to group</button>
      </form>
    </div>
  );
}
function DocumentUpload({ sender }: { sender: any }) {
  const session = useWorkspace();
  const documents = useQuery({
    queryKey: ["sender-documents", sender.id],
    queryFn: () => api("sender-documents?sender_id=" + sender.id),
    enabled: Boolean(supabase),
  });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<unknown>();
  return (
    <div>
      <h3>Business documents</h3>
      {!supabase ? (
        <div className="notice">
          Document uploads require connected Supabase private storage. The local
          simulator does not store identity documents.
        </div>
      ) : (
        <label className="file-input">
          Upload registration, TIN, licence or authorization (PDF/JPG/PNG)
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file || !supabase) return;
              try {
                const path = `${session.organization.id}/${sender.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
                const { error } = await supabase.storage
                  .from("sender-documents")
                  .upload(path, file);
                if (error) throw error;
                await api("sender-documents", {
                  method: "POST",
                  body: {
                    sender_id_id: sender.id,
                    storage_path: path,
                    document_type: "business_document",
                  },
                });
                setNotice("Document uploaded privately.");
                await documents.refetch();
              } catch (err) {
                setError(err);
              }
            }}
          />
        </label>
      )}
      {notice && <div className="notice">{notice}</div>}
      {documents.data?.data.map((document: any) => (
        <div className="member-row" key={document.id}>
          <span>{document.document_type.replaceAll("_", " ")}</span>
          <button
            className="button secondary small"
            onClick={async () => {
              try {
                const { data, error } = await supabase!.storage
                  .from("sender-documents")
                  .createSignedUrl(document.storage_path, 60);
                if (error) throw error;
                window.open(data.signedUrl, "_blank", "noopener,noreferrer");
              } catch (e) {
                setError(e);
              }
            }}
          >
            View private document
          </button>
        </div>
      ))}
      <ErrorBox error={error} />
    </div>
  );
}
function TeamInvitations() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const invitations = useQuery({
    queryKey: ["team-invitations"],
    queryFn: () => api("team-invitations"),
  });
  return (
    <section className="panel documentation">
      <div className="panel-heading">
        <div>
          <h2>Invite your team</h2>
          <p>
            Choose a role, then share your application’s signup link. The
            invitation is accepted when that email is verified.
          </p>
        </div>
        <button
          className="button secondary"
          onClick={() => {
            setOpen(true);
            setDone(false);
          }}
        >
          Invite member
        </button>
      </div>
      {invitations.data?.data.map((i: any) => (
        <div className="member-row" key={i.id}>
          <span>
            {i.email} · {i.role_id.replaceAll("_", " ")}
          </span>
          <Badge status={i.status} />
        </div>
      ))}
      {open && (
        <Modal title="Invite a team member" onClose={() => setOpen(false)}>
          <ErrorBox error={error} />
          {done ? (
            <>
              <div className="notice">
                Invitation recorded for 7 days. Share this signup link with your
                colleague. No invitation email has been sent.
              </div>
              <pre className="secret">{location.origin}/signup</pre>
              <Copy value={location.origin + "/signup"} />
            </>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await api("team-invitations", {
                    method: "POST",
                    body: Object.fromEntries(new FormData(e.currentTarget)),
                  });
                  setDone(true);
                  await invitations.refetch();
                } catch (err) {
                  setError(err);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Email
                <input name="email" type="email" required />
              </label>
              <label>
                Role
                <select name="role_id">
                  <option value="viewer">Viewer</option>
                  <option value="campaign_manager">Campaign Manager</option>
                  <option value="developer">Developer</option>
                  <option value="administrator">Administrator</option>
                </select>
              </label>
              <button className="button" disabled={busy}>
                Create invitation
              </button>
            </form>
          )}
        </Modal>
      )}
    </section>
  );
}
function CsvImport({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => Promise<unknown>;
}) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState({
    phone: "",
    first_name: "",
    last_name: "",
    email: "",
  });
  const [error, setError] = useState<unknown>();
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  async function validate() {
    const existing: any[] = [];
    const suppressed: any[] = [];
    for (const [resource, target] of [
      ["contacts", existing],
      ["suppression", suppressed],
    ] as const) {
      for (let page = 1; page <= 200; page++) {
        const res = await api(resource + "?page=" + page);
        target.push(...res.data);
        if (!res.has_more) break;
      }
    }
    const seen = new Set(existing.map((c) => c.normalized_phone));
    const blocked = new Set(suppressed.map((c) => c.normalized_phone));
    let invalid = 0,
      duplicates = 0,
      suppression = 0;
    const eligible: any[] = [];
    for (const r of rows) {
      const phone = normalizePhone(r[mapping.phone] ?? "");
      if (!phone) {
        invalid++;
        continue;
      }
      if (seen.has(phone)) {
        duplicates++;
        continue;
      }
      seen.add(phone);
      if (blocked.has(phone)) {
        suppression++;
        continue;
      }
      eligible.push({
        phone,
        first_name: r[mapping.first_name] ?? "",
        last_name: r[mapping.last_name] ?? "",
        email: r[mapping.email] ?? "",
      });
    }
    setPreview({ invalid, duplicates, suppression, eligible });
  }
  return (
    <Modal title="Import contacts from CSV" onClose={onClose}>
      <ErrorBox error={error} />
      <label className="file-input">
        Choose a CSV file (up to 10,000 rows)
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setPreview(null);
            setResult(null);
            Papa.parse<Record<string, string>>(f, {
              header: true,
              skipEmptyLines: true,
              complete: (r) => {
                if (r.errors.length || r.data.length > 10000) {
                  setError(
                    new Error("Use a valid CSV with at most 10,000 rows."),
                  );
                  return;
                }
                setRows(r.data);
                setColumns(r.meta.fields ?? []);
                setMapping({
                  phone:
                    r.meta.fields?.find((f) => /phone|mobile/i.test(f)) ?? "",
                  first_name:
                    r.meta.fields?.find((f) => /first.?name|^name$/i.test(f)) ??
                    "",
                  last_name:
                    r.meta.fields?.find((f) => /last.?name/i.test(f)) ?? "",
                  email: r.meta.fields?.find((f) => /email/i.test(f)) ?? "",
                });
              },
            });
          }}
        />
      </label>
      {columns.length > 0 && (
        <>
          <h3>Map your columns</h3>
          <div className="form-grid">
            {Object.entries(mapping).map(([key, value]) => (
              <label key={key}>
                {key.replace("_", " ")}
                <select
                  value={value}
                  onChange={(e) => {
                    setMapping({ ...mapping, [key]: e.target.value });
                    setPreview(null);
                  }}
                >
                  <option value="">Not mapped</option>
                  {columns.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <p>
            {rows.length} rows · First row: {JSON.stringify(rows[0])}
          </p>
          <button
            className="button secondary"
            disabled={!mapping.phone || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await validate();
              } catch (e) {
                setError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            Validate & preview
          </button>
        </>
      )}
      {preview && (
        <>
          <div className="notice">
            Valid: {preview.eligible.length} · Invalid: {preview.invalid} ·
            Duplicates: {preview.duplicates} · Suppressed: {preview.suppression}
          </div>
          <button
            className="button"
            disabled={busy || Boolean(result)}
            onClick={async () => {
              setBusy(true);
              let imported = 0,
                failed = 0;
              for (const contact of preview.eligible) {
                try {
                  await api("contacts", { method: "POST", body: contact });
                  imported++;
                } catch {
                  failed++;
                }
              }
              setResult({ imported, failed });
              setBusy(false);
              await onDone();
            }}
          >
            {busy
              ? "Importing…"
              : "Import " + preview.eligible.length + " contacts"}
          </button>
        </>
      )}
      {result && (
        <div className="notice">
          Imported: {result.imported} · Failed: {result.failed}. Existing
          contacts remain unchanged.
        </div>
      )}
    </Modal>
  );
}
