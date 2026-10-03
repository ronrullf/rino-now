import Link from "next/link";
export default function NotFound() {
  return (
    <div className="panel p-10">
      <h1 className="text-2xl font-semibold">Product or page not found</h1>
      <p className="mt-3 text-muted">
        Check the product ID or start a new search.
      </p>
      <Link className="btn mt-6" href="/">
        Back to search
      </Link>
    </div>
  );
}
