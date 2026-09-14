import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm font-medium">Page not found</p>
      <Link href="/" className="text-sm text-accent hover:underline">Back to the Command Center</Link>
    </div>
  );
}
