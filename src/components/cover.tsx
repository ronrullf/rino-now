"use client";
import { useState } from "react";
import { Gamepad2 } from "lucide-react";
export function Cover({
  src,
  title,
  className = "",
}: {
  src: string | null;
  title: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand-soft text-brand ${className}`}
    >
      {src && !broken ? (
        <img
          src={src}
          alt={title}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <Gamepad2 size={24} aria-label="No cover available" />
      )}
    </div>
  );
}
