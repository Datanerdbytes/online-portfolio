"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { initialsFromName } from "@/lib/avatar";

type ProfileAvatarProps = {
  src?: string | null;
  alt?: string;
  name: string;
  className?: string;
  size?: "sm" | "md" | "lg" | "resume";
  lazy?: boolean;
};

const sizeClasses = {
  sm: "h-[116px] w-[116px]",
  md: "h-[140px] w-[140px]",
  lg: "h-[168px] w-[168px]",
  resume: "h-[78px] w-[78px]",
};

const textSizes = {
  sm: "text-[39px]",
  md: "text-[46px]",
  lg: "text-[54px]",
  resume: "text-[24px]",
};

export function ProfileAvatar({
  src,
  alt = "",
  name,
  className,
  size = "sm",
  lazy = true,
}: ProfileAvatarProps) {
  const [errored, setErrored] = useState(false);
  const initials = initialsFromName(name);
  if (src && !errored) {
    return (
      <img
        src={src}
        alt={alt}
        aria-hidden={alt === "" ? true : undefined}
        className={cn("profile-avatar", sizeClasses[size], className)}
        loading={lazy ? "lazy" : "eager"}
        decoding="async"
        onError={() => setErrored(true)}
      />
    );
  }
  return (
    <div
      className={cn(
        "profile-avatar profile-avatar-fallback",
        sizeClasses[size],
        textSizes[size],
        className,
      )}
      aria-hidden={alt === "" ? true : undefined}
    >
      {initials}
    </div>
  );
}
