import { findRestaurant, type Restaurant } from "@/lib/local/restaurants";
import { getManagerDetails, type TeamMember } from "@/lib/local/staffMembers";
import { listOrdersForRestaurant } from "@/lib/local/orders";
import { listGrocery, listPurchases, listAttendance, listRiders, type AttendanceRecord, type GroceryItem, type PurchaseRecord, type Rider } from "@/lib/local/restaurantRecords";
import type { Order } from "@/types";

// Everything on one restaurant's detail page, read by restaurantId only.

export interface RestaurantDetail {
  restaurant: Restaurant;
  staff: TeamMember[];
  orders: Order[];
  grocery: GroceryItem[];
  purchases: PurchaseRecord[];
  attendance: AttendanceRecord[];
  attendanceDate: string;
  riders: Rider[];
}

// Returns null when the restaurant does not exist. Staff are the team of the restaurant's manager.
export async function getRestaurantDetail(restaurantId: string, attendanceDate: string): Promise<RestaurantDetail | null> {
  const restaurant = await findRestaurant(restaurantId);
  if (!restaurant) return null;
  const team = restaurant.managerId ? await getManagerDetails(restaurant.managerId) : null;
  return {
    restaurant,
    staff: team?.staff ?? [],
    orders: await listOrdersForRestaurant(restaurantId),
    grocery: await listGrocery(restaurantId),
    purchases: await listPurchases(restaurantId),
    attendance: await listAttendance(restaurantId, attendanceDate),
    attendanceDate,
    riders: await listRiders(restaurantId),
  };
}
