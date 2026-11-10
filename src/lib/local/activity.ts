import { getCollection } from "@/lib/local/collections";
import { randomHex } from "@/lib/local/random";

// Activity history for each owner: who changed what on the owner's account or team, and when.
// Read on the owner's details page. The stored collection ("manager_activity") and field ("managerId")
// keep their original names so history saved before the single owner role is still found.

export interface Actor {
  id: string;
  name: string;
}

export interface ActivityEntry {
  id: string;
  ownerId: string;
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

export async function logActivity(ownerId: string, actor: Actor, action: string, detail: string): Promise<void> {
  await (await activityCollection()).insertOne({
    _id: `act-${Date.now().toString(36)}-${randomHex(3)}`,
    managerId: ownerId,
    action,
    detail,
    actorId: actor.id,
    actorName: actor.name,
    createdAt: new Date().toISOString(),
  });
}

// Removes one owner's own history. Used when that owner's account is deleted: nothing can show it any
// more. Entries on other owners' histories (including the "Owner deleted" entry) are kept.
export async function deleteActivityFor(ownerId: string): Promise<void> {
  await (await activityCollection()).deleteMany({ managerId: ownerId });
}

// Newest first.
export async function listActivityFor(ownerId: string): Promise<ActivityEntry[]> {
  const docs = await (await activityCollection()).find({ managerId: ownerId }).sort({ createdAt: -1 }).limit(200).toArray();
  return docs.map((d) => ({ id: d._id, ownerId: d.managerId, action: d.action, detail: d.detail, actorName: d.actorName, createdAt: d.createdAt }));
}
