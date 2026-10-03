"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="panel p-8">
      <h1 className="text-xl font-semibold">The workspace could not load.</h1>
      <p className="mt-3 text-muted">
        Please try again. If this persists, check the local server output.
      </p>
      <button onClick={reset} className="btn mt-5">
        Try again
      </button>
    </div>
  );
}
