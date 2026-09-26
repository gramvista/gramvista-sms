import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, supabase } from "../lib/api";
import { Modal, ErrorBox } from "../components/ui";
export function SenderReview({
  sender,
  onClose,
  onSave,
  busy,
  error,
}: {
  sender: any;
  onClose: () => void;
  onSave: (body: any) => Promise<unknown>;
  busy: boolean;
  error: unknown;
}) {
  const [status, setStatus] = useState(
    sender.status === "submitted" ? "gramvista_review" : sender.status,
  );
  const [localError, setLocalError] = useState<unknown>();
  const detail = useQuery({
    queryKey: ["platform", "sender-detail", sender.id],
    queryFn: () =>
      api("platform/sender-detail/" + sender.id, { platform: true }),
  });
  const packet = [
    "GRAMVISTA EMPIRE GROUP LIMITED - Sender ID request to Kilakona",
    `Gramvista request: ${sender.id}`,
    `Sender ID: ${sender.sender_name}`,
    `Legal business: ${sender.legal_business_name}`,
    `Purpose: ${sender.purpose}`,
    `Sample message: ${sender.sample_message}`,
    `Contact: ${sender.contact_name ?? ""} / ${sender.contact_email ?? ""} / ${sender.contact_phone ?? ""}`,
    "Please confirm the required documents and enable this Sender ID on Gramvista's Kilakona sending account. If previously approved elsewhere, please confirm whether that approval can be reused and what authorization is needed.",
    "Attach the customer's supporting documents through Kilakona's confirmed registration channel.",
  ].join("\n\n");
  const record = detail.data?.record;
  return (
    <Modal title={"Review Sender ID: " + sender.sender_name} onClose={onClose}>
      <p>1. Review the customer details and supporting documents.</p>
      <textarea
        aria-label="Kilakona request package"
        readOnly
        rows={9}
        value={packet}
      />
      <button
        className="button secondary"
        type="button"
        onClick={() => {
          const url = URL.createObjectURL(
            new Blob([packet], { type: "text/plain;charset=utf-8" }),
          );
          const a = document.createElement("a");
          a.href = url;
          a.download = "kilakona-sender-request-" + sender.id + ".txt";
          a.click();
          URL.revokeObjectURL(url);
        }}
      >
        Download request
      </button>
      <p>
        2.{" "}
        <a
          href="https://messaging.kilakona.co.tz/"
          target="_blank"
          rel="noreferrer"
        >
          Open Kilakona portal
        </a>{" "}
        and submit through its confirmed registration channel. Downloading this
        request does not send it.
      </p>
      {detail.data?.documents.map((d: any) => (
        <p key={d.id}>
          <button
            type="button"
            className="button secondary small"
            onClick={async () => {
              try {
                if (!supabase)
                  throw new Error(
                    "Private document downloads require the connected website.",
                  );
                const { data, error } = await supabase.storage
                  .from("sender-documents")
                  .createSignedUrl(d.storage_path, 60);
                if (error) throw error;
                window.open(data.signedUrl, "_blank", "noopener,noreferrer");
              } catch (e) {
                setLocalError(e);
              }
            }}
          >
            View {d.document_type}
          </button>
        </p>
      ))}
      {detail.data && !detail.data.documents.length && (
        <p>No supporting documents uploaded.</p>
      )}
      <p>
        3. Record the submission reference. Mark approved only after Kilakona
        confirms this name is enabled for Gramvista. Approval from another
        provider alone is insufficient.
      </p>
      <ErrorBox error={error || localError || detail.error} />
      {!detail.isLoading && (
        <form
          key={record?.updated_at ?? "new"}
          onSubmit={async (e) => {
            e.preventDefault();
            await onSave({
              ...Object.fromEntries(new FormData(e.currentTarget)),
              status,
            });
          }}
        >
          <label>
            Approval status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {[
                "gramvista_review",
                "provider_pending",
                "approved",
                "rejected",
                "suspended",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Kilakona ticket / submission / approval reference
            <input
              name="provider_reference"
              defaultValue={record?.provider_reference ?? ""}
              required={["provider_pending", "approved"].includes(status)}
              minLength={3}
              maxLength={500}
            />
          </label>
          <label>
            Notes / rejection reason
            <textarea
              name="notes"
              defaultValue={record?.notes ?? ""}
              required={status === "rejected"}
              minLength={3}
              maxLength={4000}
            />
          </label>
          <label>
            Kilakona approval evidence
            <textarea
              name="approval_evidence"
              placeholder="Confirmation date, ticket or email reference, and confirmation that the sender is enabled on Gramvista's account"
              defaultValue={record?.approval_evidence ?? ""}
              required={status === "approved"}
              minLength={10}
              maxLength={4000}
            />
          </label>
          <button className="button" disabled={busy}>
            Save review
          </button>
        </form>
      )}
    </Modal>
  );
}
