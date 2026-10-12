import { PlaceholderPage, placeholderMetadata } from "@/components/placeholder/placeholder-page";

/**
 * Every page listed in src/lib/site-map.ts that isn't built yet lands here.
 * Real pages have their own files, which always take priority over this route.
 * Unknown addresses -> 404.
 */
type Props = { params: Promise<{ slug: string[] }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  return placeholderMetadata("/" + slug.join("/"));
}

export default async function Placeholder({ params }: Props) {
  const { slug } = await params;
  return <PlaceholderPage path={"/" + slug.join("/")} />;
}
