// Re-mounts on every navigation: a quick 160ms fade so pages feel smooth
// without slowing data entry (disabled for reduced-motion users).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
