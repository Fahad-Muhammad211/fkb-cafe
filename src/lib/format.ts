// Formats a PKR amount as "Rs. 1,234". Uses en-US grouping so server and client output match.
export function formatPKR(amount: number): string {
  return `Rs. ${amount.toLocaleString("en-US")}`;
}
