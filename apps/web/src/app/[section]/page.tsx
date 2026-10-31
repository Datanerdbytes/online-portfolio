import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  PublicSectionPage,
  isSectionId,
  sectionPageMetadata,
} from "@/components/section-page";

type Props = { params: Promise<{ section: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section } = await params;
  if (!isSectionId(section)) return { title: "Not found" };
  return sectionPageMetadata(section, null);
}

export default async function SectionPage({ params }: Props) {
  const { section } = await params;
  if (!isSectionId(section)) notFound();
  return <PublicSectionPage section={section} ownerId={null} />;
}
