import { useState, type ReactNode } from "react";
import {
  X,
  Inbox,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
} from "lucide-react";
export function Badge({ status }: { status: unknown }) {
  const value = String(status ?? "unknown");
  return (
    <span className={"badge " + value.toLowerCase()}>
      <span className="status-dot" />
      {value.replaceAll("_", " ")}
    </span>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Inbox size={26} />
      </div>
      <h3>{title}</h3>
      <p>{description ?? "Your activity will appear here."}</p>
      {action}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading">
      <LoaderCircle className="spin" /> Loading your workspace…
    </div>
  );
}
export function ErrorBox({ error }: { error: unknown }) {
  return error ? (
    <div role="alert" className="error">
      {error instanceof Error ? error.message : String(error)}
    </div>
  ) : null;
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-action">{action}</div>
    </div>
  );
}
export function Pagination({
  page,
  setPage,
  hasMore,
}: {
  page: number;
  setPage: (v: number) => void;
  hasMore: boolean;
}) {
  return (
    <div className="pagination">
      <span>Page {page} · up to 50 results per page</span>
      <div>
        <button
          className="icon-button"
          disabled={page <= 1}
          aria-label="Previous page"
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <button
          className="icon-button"
          disabled={!hasMore}
          aria-label="Next page"
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
export function Copy({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="button secondary small"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
export const number = (n: unknown) =>
  new Intl.NumberFormat("en").format(Number(n ?? 0));
export function date(v: unknown, timezone = "Africa/Dar_es_Salaam") {
  return v
    ? new Date(String(v)).toLocaleString("en-GB", {
        timeZone: timezone,
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
}
