import { PlaceholderPage, placeholderMetadata } from "@/components/placeholder/placeholder-page";

// Not built yet. This fixed address wins over the student profile route (/students/[id]), so the menu item shows the
// same "Coming soon" page as every other planned page instead of "page not found".
export const generateMetadata = () => placeholderMetadata("/students/promotion");
export default function Page() {
  return <PlaceholderPage path="/students/promotion" />;
}
