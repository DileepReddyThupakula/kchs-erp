import { PlaceholderPage, placeholderMetadata } from "@/components/placeholder/placeholder-page";

// Explicit file: /staff/[id] would otherwise catch this address.
export const metadata = placeholderMetadata("/staff/attendance");

export default function Page() {
  return <PlaceholderPage path="/staff/attendance" />;
}
