import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Modal, ErrorBox, Badge, date, number } from "../components/ui";

export function OrderDetail({
  id,
  admin = false,
  onClose,
}: {
  id: string;
  admin?: boolean;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState("approved");
  const query = useQuery({
    queryKey: ["order-detail", id, admin],
    refetchInterval: 10000,
    queryFn: () =>
      api(admin ? "platform/order-detail/" + id : "orders/" + id, {
        platform: admin,
      }),
  });
  const data = query.data;
  const p = data?.payment;
  async function submit(path: string, body: object) {
    setBusy(true);
    setError(null);
    try {
      await api(path, { method: "POST", body, platform: admin });
      await Promise.all([
        client.invalidateQueries({ queryKey: ["order-detail", id] }),
        client.invalidateQueries({ queryKey: ["payments"] }),
        client.invalidateQueries({ queryKey: ["platform"] }),
        client.invalidateQueries({ queryKey: ["platform-stats"] }),
        client.invalidateQueries({ queryKey: ["balance"] }),
        client.invalidateQueries({ queryKey: ["transactions"] }),
      ]);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={admin ? "Review SMS order" : "SMS order"} onClose={onClose}>
      <ErrorBox error={error || query.error} />
      {p && (
        <>
          <h3 style={{ overflowWrap: "anywhere" }}>{p.order_reference}</h3>
          {admin && (
            <p>
              Customer: <strong>{data.organization?.name}</strong> (
              {data.organization?.email})
            </p>
          )}
          <p>
            <Badge status={p.status} /> ? Created {date(p.created_at)}
          </p>
          <p>
            <strong>
              {number(p.sms_units)} SMS ? {p.currency} {number(p.amount)}
            </strong>
          </p>
          <p>
            Payment method: {p.method.replaceAll("_", " ")}
            <br />
            Payment reference: {p.payment_reference ?? "Not submitted"}
          </p>
          {p.payment_submitted_at && (
            <p>Payment submitted: {date(p.payment_submitted_at)}</p>
          )}
          {p.review_notes && <p>Review notes: {p.review_notes}</p>}
          {p.status === "awaiting_payment" && (
            <div className="notice">
              Your order is saved. Payment has not been confirmed, and no SMS
              has been allocated. Contact Gramvista for verified payment
              instructions, then submit your payment details here.
            </div>
          )}
          {p.status === "pending" && (
            <div className="notice">
              Payment details are awaiting admin review. SMS will be allocated
              only after payment and bank capacity are verified.
            </div>
          )}
          {p.status === "verified" && (
            <div className="notice success">
              Payment verified. {number(p.sms_units)} SMS allocated on{" "}
              {date(p.verified_at)}.
            </div>
          )}
          {!admin && ["awaiting_payment", "rejected"].includes(p.status) && (
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const f = new FormData(event.currentTarget);
                await submit("orders/" + id + "/payment", {
                  method: f.get("method"),
                  reference: f.get("reference"),
                });
              }}
            >
              <h3>Submit payment details</h3>
              <label>
                Payment method
                <select name="method" required>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="mobile_money">Mobile money</option>
                  <option value="manual">Other verified method</option>
                </select>
              </label>
              <label>
                Payment reference
                <input
                  name="reference"
                  minLength={3}
                  maxLength={120}
                  required
                  defaultValue={p.payment_reference ?? ""}
                />
              </label>
              <button className="button" disabled={busy}>
                Submit payment for review
              </button>
            </form>
          )}
          {admin && p.status === "pending" && (
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const f = new FormData(event.currentTarget);
                await submit("platform/payments/" + id, {
                  decision,
                  notes: f.get("notes"),
                  ...(decision === "approved"
                    ? {
                        received_amount: f.get("received_amount"),
                        currency: p.currency,
                        receipt_reference: f.get("receipt_reference"),
                        confirmed: f.get("confirmed") === "on",
                      }
                    : {}),
                });
              }}
            >
              <p>
                Available to allocate:{" "}
                <strong>
                  {number(data.inventory?.available_to_allocate)} SMS
                </strong>
              </p>
              <label>
                Review decision
                <select
                  value={decision}
                  onChange={(e) => setDecision(e.target.value)}
                >
                  <option value="approved">
                    Approve payment and allocate SMS
                  </option>
                  <option value="rejected">Reject payment details</option>
                </select>
              </label>
              {decision === "approved" && (
                <>
                  <label>
                    Amount received ({p.currency})
                    <input
                      name="received_amount"
                      inputMode="decimal"
                      pattern="[0-9]+([.][0-9]{1,2})?"
                      required
                    />
                  </label>
                  <label>
                    Verified receipt reference
                    <input
                      name="receipt_reference"
                      minLength={3}
                      maxLength={120}
                      required
                    />
                  </label>
                  <label className="check-label">
                    <input name="confirmed" type="checkbox" required />I checked
                    the actual payment receipt, customer and amount.
                  </label>
                  {(!data.inventory?.inventory_fresh ||
                    Number(data.inventory?.available_to_allocate) <
                      Number(p.sms_units)) && (
                    <div className="notice">
                      The SMS bank cannot currently cover this order. Sync or
                      fund provider inventory before approval.
                    </div>
                  )}
                </>
              )}
              <label>
                Review notes / rejection reason
                <textarea
                  name="notes"
                  minLength={3}
                  maxLength={2000}
                  required
                />
              </label>
              <button
                className="button"
                disabled={
                  busy ||
                  (decision === "approved" &&
                    (!data.inventory?.inventory_fresh ||
                      Number(data.inventory?.available_to_allocate) <
                        Number(p.sms_units)))
                }
              >
                {decision === "approved"
                  ? "Confirm approval and allocation"
                  : "Confirm rejection"}
              </button>
            </form>
          )}
          <h3>Order history</h3>
          {data.events?.map((entry: any) => (
            <p key={entry.id}>
              <small>{date(entry.created_at)}</small>
              <br />
              {entry.description}
            </p>
          ))}
          {data.invoice && (
            <>
              <h3>Invoice</h3>
              <p>
                {data.invoice.invoice_reference}
                <br />
                {data.invoice.currency} {number(data.invoice.amount)} ?{" "}
                {date(data.invoice.created_at)}
              </p>
            </>
          )}
          {data.transaction && (
            <>
              <h3>Wallet allocation</h3>
              <p>
                +{number(data.transaction.units)} SMS ?{" "}
                {date(data.transaction.created_at)}
                <br />
                Balance: {number(data.transaction.balance_before)} ?{" "}
                {number(data.transaction.balance_after)} SMS
                <br />
                Ledger ID: {data.transaction.id}
              </p>
            </>
          )}
          {admin && data.reviews?.length > 0 && (
            <>
              <h3>Approval records</h3>
              {data.reviews.map((r: any) => (
                <p key={r.id}>
                  {r.decision} ? {date(r.created_at)}
                  <br />
                  Reviewer: {r.actor_id ?? "Legacy record"}
                  <br />
                  {r.receipt_reference && (
                    <>
                      Receipt: {r.receipt_reference} ? {r.currency}{" "}
                      {number(r.received_amount)}
                      <br />
                    </>
                  )}
                  {r.notes}
                </p>
              ))}
            </>
          )}
          <button
            className="button secondary"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob(
                  [
                    JSON.stringify(
                      {
                        order: p,
                        history: data.events,
                        invoice: data.invoice,
                        wallet_allocation: data.transaction,
                        ...(admin ? { reviews: data.reviews } : {}),
                      },
                      null,
                      2,
                    ),
                  ],
                  { type: "application/json" },
                ),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = p.order_reference + ".json";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Download order record
          </button>
        </>
      )}
    </Modal>
  );
}
