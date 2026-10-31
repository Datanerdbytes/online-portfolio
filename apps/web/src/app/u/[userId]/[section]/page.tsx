import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  PublicSectionPage,
  isSectionId,
  sectionPageMetadata,
} from "@/components/section-page";

type Props = { params: Promise<{ userId: string; section: string }> };

function isOwnerId(value: string): boolean {
  return /^[a-zA-Z0-9-]{1,128}$/.test(value);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { userId, section } = await params;
  if (!isOwnerId(userId) || !isSectionId(section))
    return { title: "Not found" };
  return sectionPageMetadata(section, userId);
}

export default async function SharedSectionPage({ params }: Props) {
  const { userId, section } = await params;
  if (!isOwnerId(userId) || !isSectionId(section)) notFound();
  return <PublicSectionPage section={section} ownerId={userId} />;
}
