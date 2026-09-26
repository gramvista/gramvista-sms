import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  Send,
  ArrowRight,
  ShieldCheck,
  Users,
  MessageSquare,
  Check,
  Clock3,
} from "lucide-react";
import { api } from "../lib/api";
import { useWorkspace } from "../app/App";
import { estimateSms, filterRecipients } from "../../shared/sms";
import { PageTitle, ErrorBox, Modal, number } from "../components/ui";
export function Composer({ campaign = false }: { campaign?: boolean }) {
  const session = useWorkspace();
  const client = useQueryClient();
  const nav = useNavigate();
  const [mode, setMode] = useState("numbers");
  const [name, setName] = useState("");
  const [sender, setSender] = useState("");
  const [recipients, setRecipients] = useState("");
  const [message, setMessage] = useState("");
  const [schedule, setSchedule] = useState("");
  const [group, setGroup] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [test, setTest] = useState(false);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [key, setKey] = useState(crypto.randomUUID());
  const senders = useQuery({
    queryKey: ["sender-ids"],
    queryFn: () => api("sender-ids"),
  });
  const contacts = useQuery({
    queryKey: ["contacts"],
    queryFn: () => api("contacts"),
  });
  const groups = useQuery({
    queryKey: ["groups"],
    queryFn: () => api("groups"),
  });
  const members = useQuery({
    queryKey: ["group-members"],
    queryFn: () => api("group-members"),
  });
  const templates = useQuery({
    queryKey: ["templates"],
    queryFn: () => api("templates"),
  });
  const suppression = useQuery({
    queryKey: ["suppression"],
    queryFn: () => api("suppression"),
  });
  const balance = useQuery({
    queryKey: ["balance"],
    queryFn: () => api("balance"),
  });
  const candidates = useMemo(
    () =>
      mode === "numbers"
        ? recipients
            .split(/[,;\n]+/)
            .map((s) => s.trim())
            .filter(Boolean)
        : mode === "contacts"
          ? selected
          : (contacts.data?.data ?? [])
              .filter((c: any) =>
                members.data?.data.some(
                  (m: any) => m.group_id === group && m.contact_id === c.id,
                ),
              )
              .map((c: any) => c.normalized_phone),
    [mode, recipients, selected, contacts.data, members.data, group],
  );
  const validation = filterRecipients(
    candidates,
    suppression.data?.data.map((s: any) => s.normalized_phone) ?? [],
  );
  const sms = estimateSms(message);
  const units = sms.parts * validation.eligible.length;
  const ready =
    sender &&
    (!campaign || name.trim()) &&
    message.trim() &&
    validation.eligible.length > 0 &&
    (test || units <= Number(balance.data?.available_sms ?? 0));
  const approved =
    senders.data?.data.filter((s: any) => s.status === "approved") ?? [];
  return (
    <>
      <PageTitle
        eyebrow={campaign ? "CAMPAIGN" : "DIRECT MESSAGE"}
        title={campaign ? "Create a campaign" : "Send an SMS"}
        description={campaign
          ? "Prepare a named message for a larger audience or a scheduled send."
          : "Enter a number, write your message, and send. No campaign setup needed."}
      />
      {campaign && <div className="compose-progress">
        {[
          [Users, "Audience"],
          [MessageSquare, "Message"],
          [Clock3, "Schedule"],
          [ShieldCheck, "Review & send"],
        ].map(([Icon, label]: any, i) => (
          <div key={label}>
            <span>{i + 1}</span>
            <Icon size={16} />
            {label}
            {i < 3 && <ArrowRight size={15} />}
          </div>
        ))}
      </div>}
      <ErrorBox error={error} />
      <div className="compose-grid">
        <form
          className="panel compose-form"
          onSubmit={(e) => {
            e.preventDefault();
            setReview(true);
          }}
        >
          <div className="section-label">
            <span>01</span>
            <h2>{campaign ? "Campaign details" : "Send from"}</h2>
          </div>
          {campaign && <label>
            Campaign name
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setKey(crypto.randomUUID());
              }}
              required
              placeholder="e.g. September customer update"
              maxLength={100}
            />
          </label>}
          <label>
            Sender ID
            <select
              value={sender}
              onChange={(e) => setSender(e.target.value)}
              required
            >
              <option value="">Select an approved Sender ID</option>
              {approved.map((s: any) => (
                <option key={s.id} value={s.sender_name}>
                  {s.sender_name}
                </option>
              ))}
            </select>
          </label>
          {!approved.length && (
            <div className="notice">
              You need an approved Sender ID before sending.{" "}
              <Link to="/sender-ids">
                Request one <ArrowRight size={13} />
              </Link>
            </div>
          )}
          <div className="section-label">
            <span>02</span>
            <h2>Choose your audience</h2>
          </div>
          <div className="segmented">
            {[
              ["numbers", "Phone numbers"],
              ["contacts", "Contacts"],
              ["group", "Group"],
            ].map(([v, label]) => (
              <button
                type="button"
                key={v}
                className={mode === v ? "selected" : ""}
                onClick={() => setMode(v)}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === "numbers" ? (
            <label>
              Recipients
              <textarea
                rows={4}
                value={recipients}
                onChange={(e) => setRecipients(e.target.value)}
                placeholder={"+255712345678\n+255754123456"}
              />
              <small>
                Separate numbers with commas or new lines. Tanzanian local
                numbers are normalized automatically.
              </small>
            </label>
          ) : mode === "group" ? (
            <label>
              Select group
              <select value={group} onChange={(e) => setGroup(e.target.value)}>
                <option value="">Choose group</option>
                {groups.data?.data.map((g: any) => (
                  <option value={g.id} key={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <small>
                Groups and contacts shown here are the first 50 records.
              </small>
            </label>
          ) : (
            <div className="contact-selector">
              {contacts.data?.data
                .filter((c: any) => c.status === "active")
                .map((c: any) => (
                  <label className="check-label" key={c.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(c.normalized_phone)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, c.normalized_phone]
                            : selected.filter((p) => p !== c.normalized_phone),
                        )
                      }
                    />
                    {c.first_name} <span>{c.normalized_phone}</span>
                  </label>
                ))}
              <small>
                Showing the first 50 contacts. Use phone numbers for larger
                audiences.
              </small>
            </div>
          )}
          <div className="recipient-checks">
            <span>
              <Check size={14} />
              {validation.eligible.length} eligible
            </span>
            <span>{validation.duplicates} duplicates</span>
            <span>{validation.invalid} invalid</span>
            <span>{validation.suppressed} suppressed</span>
          </div>
          <div className="section-label">
            <span>03</span>
            <h2>Your message</h2>
          </div>
          <label>
            Use a template
            <select
              defaultValue=""
              onChange={(e) => {
                const t = templates.data?.data.find(
                  (t: any) => t.id === e.target.value,
                );
                if (t) setMessage(t.message);
              }}
            >
              <option value="">Start with a blank message</option>
              {templates.data?.data.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Message
            <textarea
              rows={6}
              required
              maxLength={5000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Hi there! We have something to share with you…"
            />
          </label>
          <div className="message-counter">
            <span>
              {sms.characters} characters · {sms.encoding}
            </span>
            <span>
              {sms.parts} estimated SMS {sms.parts === 1 ? "part" : "parts"}
            </span>
          </div>
          {campaign && <div className="section-label">
            <span>04</span>
            <h2>Delivery time</h2>
          </div>}
          {campaign && <label>
            Schedule (optional)
            <input
              type="datetime-local"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
            />
            <small>
              Leave blank to send now. Selected time uses your browser timezone:{" "}
              {Intl.DateTimeFormat().resolvedOptions().timeZone}. Quiet hours
              use {session.organization.timezone}.
            </small>
          </label>}
          {session.demo && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={test}
                onChange={(e) => setTest(e.target.checked)}
              />
              Test send — simulate delivery without consuming credits
            </label>
          )}
          <button className="button" type="submit" disabled={!ready || busy}>
            {campaign ? "Review campaign" : "Review SMS"} <ArrowRight size={17} />
          </button>
        </form>
        <aside className="compose-aside">
          <section className="panel">
            <div className="panel-heading">
              <h2>Message preview</h2>
              <MessageSquare size={19} />
            </div>
            <div className="phone-preview">
              <div className="phone-notch" />
              <div className="phone-top">
                <span>9:41</span>
                <span>••• ▰</span>
              </div>
              <div className="phone-sender">
                <span className="phone-avatar">
                  <MessageSquare size={20} />
                </span>
                <strong>{sender || "Your Sender ID"}</strong>
                <small>Text message</small>
              </div>
              <div className="sms-bubble">
                {message ||
                  "Your message will appear here. Keep it clear, personal and worth opening."}
              </div>
              <span className="phone-time">Now</span>
              <div className="phone-bottom" />
            </div>
            <p className="preview-caption">
              A preview of your customer’s next connection.
            </p>
          </section>
          <section className="panel estimate-card">
            <h2>{campaign ? "Campaign estimate" : "Send estimate"}</h2>
            <div>
              <span>Eligible recipients</span>
              <strong>{number(validation.eligible.length)}</strong>
            </div>
            <div>
              <span>SMS parts per recipient</span>
              <strong>{sms.parts}</strong>
            </div>
            <div className="estimate-total">
              <span>Estimated SMS units</span>
              <strong>{number(units)}</strong>
            </div>
            <div>
              <span>Available balance</span>
              <strong>{number(balance.data?.available_sms)}</strong>
            </div>
            <div>
              <span>Estimated balance after</span>
              <strong>
                {number(
                  Number(balance.data?.available_sms ?? 0) - (test ? 0 : units),
                )}
              </strong>
            </div>
            <small>
              Multipart and Unicode units are estimates. Billing follows your
              configured messaging agreement.
            </small>
          </section>
        </aside>
      </div>
      {review && (
        <Modal
          title={campaign ? "Review your campaign" : "Review your SMS"}
          onClose={() => {
            if (!busy) setReview(false);
          }}
        >
          <ErrorBox error={error} />
          <div className="detail-list">
            {Object.entries({
              ...(campaign ? { Campaign: name } : {}),
              "Sender ID": sender,
              "Eligible recipients": validation.eligible.length,
              Invalid: validation.invalid,
              Duplicates: validation.duplicates,
              Suppressed: validation.suppressed,
              "Estimated SMS units": units,
              "SMS balance": balance.data?.available_sms,
              Delivery: schedule
                ? new Date(schedule).toLocaleString()
                : "Send now",
              Mode: test
                ? "Test — no credits consumed"
                : session.demo
                  ? "Mock provider — local wallet accounting"
                  : "Live",
            }).map(([k, v]) => (
              <div key={k}>
                <span>{k}</span>
                <strong>{String(v)}</strong>
              </div>
            ))}
          </div>
          <div className="message-review">{message}</div>
          <button
            className="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await api(campaign ? "campaigns" : "messages", {
                  method: "POST",
                  key,
                  body: {
                    name: campaign ? name : "Direct SMS",
                    sender_id: sender,
                    recipients: candidates,
                    message,
                    scheduled_at: schedule
                      ? new Date(schedule).toISOString()
                      : null,
                    test_mode: test,
                  },
                });
                await client.invalidateQueries();
                nav(campaign ? "/campaigns" : "/messages");
              } catch (err) {
                setError(err);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Send size={17} />
            {busy
              ? "Queuing…"
              : schedule
                ? "Confirm & schedule"
                : "Confirm & send"}
          </button>
        </Modal>
      )}
    </>
  );
}
