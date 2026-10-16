"use client";
import { useEffect, useRef, type ReactNode } from "react";
import {
  Check,
  X,
  FileCode2,
  FileImage,
  FileText,
  ShieldCheck,
  Box,
  AlertTriangle,
} from "lucide-react";
import type { Artifact, Project } from "../lib/model";
import { latestReview } from "../lib/model";
export function Modal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = ref.current!;
    const focusable = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex="0"]',
        ),
      );
    focusable()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      if (e.key === "Tab") {
        const nodes = focusable();
        const first = nodes[0];
        const last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        ref={ref}
      >
        <header>
          <div>
            <h2 id="modal-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Luk dialog"
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
export function Badge({
  kind = "neutral",
  children,
}: {
  kind?: "neutral" | "success" | "warning" | "purple";
  children: ReactNode;
}) {
  return <span className={`badge badge-${kind}`}>{children}</span>;
}
export function AssetIcon({
  artifact,
  size = 20,
}: {
  artifact: Pick<Artifact, "kind">;
  size?: number;
}) {
  const Icon =
    artifact.kind === "code"
      ? FileCode2
      : artifact.kind === "design" || artifact.kind === "image"
        ? FileImage
        : artifact.kind === "evidence"
          ? ShieldCheck
          : artifact.kind === "document"
            ? FileText
            : Box;
  return <Icon size={size} />;
}
export function DeliveryStatus({
  project,
  deliveryId,
}: {
  project: Project;
  deliveryId: string;
}) {
  const review = latestReview(project, deliveryId);
  return (
    <Badge
      kind={
        review?.decision === "accepted"
          ? "success"
          : review
            ? "warning"
            : "purple"
      }
    >
      {review?.decision === "accepted" ? (
        <>
          <Check size={12} /> Accepteret
        </>
      ) : review ? (
        "Rettelse ønsket"
      ) : (
        "Klar til review"
      )}
    </Badge>
  );
}
export function Empty({
  icon,
  title,
  text,
  children,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}
export function Notice({
  children,
  danger = false,
}: {
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <div className={`notice ${danger ? "notice-danger" : ""}`}>
      <AlertTriangle size={16} />
      <div>{children}</div>
    </div>
  );
}
export function formatDate(value: string) {
  return new Intl.DateTimeFormat("da-DK", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
export function bytesLabel(value: number) {
  return value < 1024
    ? `${value} B`
    : value < 1024 * 1024
      ? `${(value / 1024).toFixed(1)} KB`
      : `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
