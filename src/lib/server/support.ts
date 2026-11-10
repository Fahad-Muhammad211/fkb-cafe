import { randomHex } from "@/lib/server/random";
import type { Document } from "@/lib/server/collections";
import { getCollection } from "@/lib/server/collections";
import type { FieldErrors } from "@/lib/server/http";
import { COMPLAINT_TOPICS, type ComplaintTopic, type SupportTicket } from "@/types/customer";

// Complaints from customers. Each ticket belongs to one customer and is only listed back to them.
// Admins have no screen for tickets yet, so they are stored in the support_tickets collection.

const MAX_OPEN_TICKETS = 20;

type TicketDoc = Omit<SupportTicket, "id"> & { _id: string; userId: string };

const ticketsCollection = () =>
  getCollection<TicketDoc>("support_tickets", [{ key: { userId: 1, createdAt: -1 }, name: "support_user_created" }]);
const ordersCollection = () => getCollection<{ _id: string; userId?: string } & Document>("orders");

const toTicket = (doc: TicketDoc): SupportTicket => ({
  id: doc._id,
  topic: doc.topic,
  orderId: doc.orderId,
  message: doc.message,
  status: doc.status,
  createdAt: doc.createdAt,
});

export async function listTickets(userId: string): Promise<SupportTicket[]> {
  const docs = await (await ticketsCollection()).find({ userId }).sort({ createdAt: -1 }).limit(50).toArray();
  return docs.map(toTicket);
}

export async function createTicket(
  userId: string,
  input: { topic: unknown; orderId: unknown; message: unknown },
): Promise<{ ok: true; ticket: SupportTicket } | { ok: false; status: number; error: string; errors?: FieldErrors }> {
  const errors: FieldErrors = {};
  const topic = COMPLAINT_TOPICS.find((t) => t === input.topic);
  if (!topic) errors.topic = "Choose what your complaint is about.";

  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (message.length < 10) errors.message = "Describe the problem in at least 10 characters.";
  else if (message.length > 1000) errors.message = "Keep your message under 1000 characters.";

  let orderId: string | null = null;
  if (input.orderId !== undefined && input.orderId !== null && input.orderId !== "") {
    if (typeof input.orderId !== "string" || !/^MEG-\d{6}$/.test(input.orderId)) {
      errors.orderId = "Choose one of your orders.";
    } else {
      const owned = await (await ordersCollection()).findOne({ _id: input.orderId, userId }, { projection: { _id: 1 } });
      if (!owned) errors.orderId = "Choose one of your orders.";
      else orderId = input.orderId;
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, status: 400, error: "Please correct the highlighted fields.", errors };

  const collection = await ticketsCollection();
  const openCount = await collection.countDocuments({ userId, status: "open" });
  if (openCount >= MAX_OPEN_TICKETS) {
    return { ok: false, status: 409, error: "You already have many open complaints. Please wait for a reply before sending another." };
  }

  const doc: TicketDoc = {
    _id: `TKT-${Date.now().toString(36)}-${randomHex(3)}`,
    userId,
    topic: topic as ComplaintTopic,
    orderId,
    message,
    status: "open",
    createdAt: new Date().toISOString(),
  };
  await collection.insertOne(doc);
  return { ok: true, ticket: toTicket(doc) };
}
