"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { initialsFromName } from "@/lib/avatar";

type ProfileAvatarProps = {
  src?: string | null;
  alt?: string;
  name: string;
  className?: string;
  size?: "xs" | "sm" | "md" | "lg" | "resume";
  lazy?: boolean;
};

const sizeClasses = {
  xs: "h-[36px] w-[36px]",
  sm: "h-[116px] w-[116px]",
  md: "h-[140px] w-[140px]",
  lg: "h-[168px] w-[168px]",
  resume: "h-[78px] w-[78px]",
};

const sizePixels = {
  xs: 36,
  sm: 116,
  md: 140,
  lg: 168,
  resume: 78,
};

const textSizes = {
  xs: "text-[13px]",
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
      <Image
        src={src}
        alt={alt}
        width={sizePixels[size]}
        height={sizePixels[size]}
        unoptimized
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
        className
      )}
      aria-hidden={alt === "" ? true : undefined}
    >
      {initials}
    </div>
  );
}
