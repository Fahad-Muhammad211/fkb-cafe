import { getCollection } from "@/lib/local/collections";
import { randomHex } from "@/lib/local/random";

// Activity history for each manager: who changed what on the manager's account or team, and when.
// Stored in the "manager_activity" collection and read on the manager's details page.

export interface Actor {
  id: string;
  name: string;
}

export interface ActivityEntry {
  id: string;
  managerId: string;
  action: string;
  detail: string;
  actorName: string;
  createdAt: string;
}

type ActivityDoc = {
  _id: string;
  managerId: string;
  action: string;
  detail: string;
  actorId: string;
  actorName: string;
  createdAt: string;
};

const activityCollection = () =>
  getCollection<ActivityDoc>("manager_activity", [{ key: { managerId: 1 }, name: "activity_by_manager" }]);

export async function logActivity(managerId: string, actor: Actor, action: string, detail: string): Promise<void> {
  await (await activityCollection()).insertOne({
    _id: `act-${Date.now().toString(36)}-${randomHex(3)}`,
    managerId,
    action,
    detail,
    actorId: actor.id,
    actorName: actor.name,
    createdAt: new Date().toISOString(),
  });
}

// Newest first.
export async function listActivityFor(managerId: string): Promise<ActivityEntry[]> {
  const docs = await (await activityCollection()).find({ managerId }).sort({ createdAt: -1 }).limit(200).toArray();
  return docs.map((d) => ({ id: d._id, managerId: d.managerId, action: d.action, detail: d.detail, actorName: d.actorName, createdAt: d.createdAt }));
}
