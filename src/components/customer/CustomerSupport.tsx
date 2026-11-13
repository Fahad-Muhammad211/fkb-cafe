"use client";

import { useState, type FormEvent } from "react";
import { Clock, LifeBuoy, Mail, MapPin, Phone, Send } from "lucide-react";
import { Card, EmptyState, ErrorNote, LoadingBlock, Notice, PageHeader, Pill, inputStyles, primaryButton } from "@/components/customer/ui";
import { dateTime } from "@/components/customer/orderFormat";
import { customerRequest, useCustomerData } from "@/components/customer/useCustomerData";
import { FormField, describedBy } from "@/components/ui/FormField";
import { BRANCH_ADDRESS, CONTACT_EMAIL, CONTACT_PHONE, DELIVERY_HOURS } from "@/lib/constants";
import { COMPLAINT_TOPIC_LABELS, COMPLAINT_TOPICS, type ComplaintTopic, type SupportTicket } from "@/types/customer";
import type { Order } from "@/types";

type Errors = Record<string, string>;

export function CustomerSupport({ initialOrderId }: { initialOrderId: string }) {
  const tickets = useCustomerData<{ tickets: SupportTicket[] }>("/api/customer/support");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Help" title="Customer support" description="Reach us directly, or send a complaint that stays linked to your account." />
      <ContactOptions />
      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <ComplaintForm initialOrderId={initialOrderId} onSent={tickets.reload} />
        <TicketList tickets={tickets} />
      </div>
    </div>
  );
}

function ContactOptions() {
  const options = [
    { icon: Phone, label: "Call us", value: CONTACT_PHONE.display, href: CONTACT_PHONE.href },
    { icon: Mail, label: "Email", value: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}` },
    { icon: MapPin, label: "Branch", value: BRANCH_ADDRESS, href: undefined },
    { icon: Clock, label: "Delivery hours", value: DELIVERY_HOURS, href: undefined },
  ];
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {options.map(({ icon: Icon, label, value, href }) => (
        <li key={label}>
          <Card className="flex h-full flex-col gap-3 p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/15 text-orange-500 ring-1 ring-orange-500/30">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{label}</p>
            {href ? (
              <a href={href} className="break-words text-sm font-semibold text-white hover:text-orange-400">
                {value}
              </a>
            ) : (
              <p className="text-sm text-zinc-200">{value}</p>
            )}
          </Card>
        </li>
      ))}
    </ul>
  );
}

function ComplaintForm({ initialOrderId, onSent }: { initialOrderId: string; onSent: () => void }) {
  const { data: ordersData } = useCustomerData<{ orders: Order[] }>("/api/orders");
  const [topic, setTopic] = useState<ComplaintTopic>("order");
  const [orderId, setOrderId] = useState(initialOrderId);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSent(false);
    setFormError(null);
    const found: Errors = {};
    if (message.trim().length < 10) found.message = "Describe the problem in at least 10 characters.";
    else if (message.trim().length > 1000) found.message = "Keep your message under 1000 characters.";
    setErrors(found);
    if (found.message) {
      document.getElementById("complaint-message")?.focus();
      return;
    }

    setPending(true);
    const result = await customerRequest("/api/customer/support", "POST", { topic, orderId: orderId || null, message });
    setPending(false);
    if (result.ok) {
      setMessage("");
      setOrderId("");
      setSent(true);
      onSent();
    } else {
      setErrors(result.errors ?? {});
      setFormError(result.errors ? null : result.error);
    }
  };

  const orders = ordersData?.orders ?? [];

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/15 text-orange-500 ring-1 ring-orange-500/30">
            <LifeBuoy className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-bold">Send a complaint</h2>
            <p className="text-xs text-zinc-400">Your complaint is saved to your account for our team to review.</p>
          </div>
        </div>

        {formError && <ErrorNote message={formError} />}
        {sent && <Notice tone="success">Your complaint has been sent. It now appears in your complaint history.</Notice>}

        <FormField id="complaint-topic" label="What is it about?" error={errors.topic}>
          <select id="complaint-topic" value={topic} onChange={(e) => setTopic(e.target.value as ComplaintTopic)} className={inputStyles}>
            {COMPLAINT_TOPICS.map((t) => (
              <option key={t} value={t}>
                {COMPLAINT_TOPIC_LABELS[t]}
              </option>
            ))}
          </select>
        </FormField>

        <FormField id="complaint-order" label="Related order (optional)" error={errors.orderId}>
          <select id="complaint-order" value={orderId} onChange={(e) => setOrderId(e.target.value)} className={inputStyles}>
            <option value="">No specific order</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.id} · {dateTime(o.createdAt)}
              </option>
            ))}
          </select>
        </FormField>

        <FormField id="complaint-message" label="Your message" error={errors.message} hint="Between 10 and 1000 characters">
          <textarea
            id="complaint-message"
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-invalid={Boolean(errors.message)}
            aria-describedby={describedBy("complaint-message", errors.message, "Between 10 and 1000 characters")}
            className={inputStyles}
          />
        </FormField>

        <button type="submit" disabled={pending} className={`${primaryButton} w-fit`}>
          <Send className="h-4 w-4" aria-hidden="true" />
          {pending ? "Sending…" : "Send complaint"}
        </button>
      </form>
    </Card>
  );
}

type TicketsState = ReturnType<typeof useCustomerData<{ tickets: SupportTicket[] }>>;

function TicketList({ tickets }: { tickets: TicketsState }) {
  const { data, error, loading, reload } = tickets;
  const items = data?.tickets ?? [];

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-bold">Your complaints</h2>
      {loading && <LoadingBlock label="Loading your complaints…" />}
      {error && <ErrorNote message={error} onRetry={reload} />}
      {data && items.length === 0 && (
        <EmptyState icon={LifeBuoy} title="No complaints sent" description="Complaints you send from this page will be listed here with their status." />
      )}
      {items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((t) => (
            <li key={t.id}>
              <Card className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{COMPLAINT_TOPIC_LABELS[t.topic]}{t.orderId ? ` · ${t.orderId}` : ""}</p>
                  <Pill tone="orange">Open</Pill>
                </div>
                <p className="text-sm text-zinc-300">{t.message}</p>
                <p className="text-xs text-zinc-500">Sent {dateTime(t.createdAt)}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
