import Image from "next/image";
import {
  faDiscord,
  faGithub,
  faSlack,
} from "@fortawesome/free-brands-svg-icons";

type SocialBrand = "github" | "tableau" | "slack" | "discord";

const BRAND_ICONS = {
  github: faGithub,
  slack: faSlack,
  discord: faDiscord,
} as const;

const SOCIAL_PLACEHOLDERS: { label: string; brand: SocialBrand }[] = [
  { label: "Slack", brand: "slack" },
  { label: "Discord", brand: "discord" },
];

function identifySocialBrand(label: string, url: string): SocialBrand | null {
  const normalizedLabel = label.toLowerCase();
  let hostname = "";
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    // Unknown or malformed destinations retain their text label.
  }

  if (
    normalizedLabel.includes("github") ||
    hostname === "github.com" ||
    hostname.endsWith(".github.com")
  )
    return "github";
  if (
    normalizedLabel.includes("tableau") ||
    hostname === "tableau.com" ||
    hostname.endsWith(".tableau.com")
  )
    return "tableau";
  if (
    normalizedLabel.includes("slack") ||
    hostname === "slack.com" ||
    hostname.endsWith(".slack.com")
  )
    return "slack";
  if (
    normalizedLabel.includes("discord") ||
    hostname === "discord.com" ||
    hostname.endsWith(".discord.com") ||
    hostname === "discord.gg" ||
    hostname.endsWith(".discord.gg")
  )
    return "discord";
  return null;
}

function SocialMark({ brand }: { brand: SocialBrand }) {
  if (brand === "tableau") {
    return (
      <Image
        className="masthead-social-tableau"
        src="/brands/tableau.png"
        alt=""
        width={24}
        height={24}
        aria-hidden="true"
      />
    );
  }

  const icon = BRAND_ICONS[brand];
  const [width, height, , , pathData] = icon.icon;
  const paths = Array.isArray(pathData) ? pathData : [pathData];
  return (
    <svg
      className="masthead-social-mark"
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((path, index) => (
        <path d={path} key={index} />
      ))}
    </svg>
  );
}

type SocialLink = {
  label: string;
  url: string | null;
  brand: SocialBrand | null;
};

export function SocialLinks({
  links,
  className = "masthead-socials",
}: {
  links: { label: string; url: string }[];
  className?: string;
}) {
  const configured: SocialLink[] = links.map((link) => ({
    ...link,
    brand: identifySocialBrand(link.label, link.url),
  }));
  const configuredBrands = new Set(
    configured.flatMap((link) => (link.brand ? [link.brand] : []))
  );
  const items: SocialLink[] = [
    ...configured,
    ...SOCIAL_PLACEHOLDERS.filter(
      ({ brand }) => !configuredBrands.has(brand)
    ).map(({ label, brand }) => ({ label, url: null, brand })),
  ];

  return (
    <div role="group" aria-label="Social profiles" className={className}>
      {items.map((link) =>
        link.url ? (
          <a
            key={link.url}
            className="masthead-social-link"
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={link.label}
            title={link.label}
          >
            {link.brand ? (
              <SocialMark brand={link.brand} />
            ) : (
              <span>{link.label}</span>
            )}
          </a>
        ) : (
          <span
            key={link.label}
            className="masthead-social-link is-placeholder"
            role="img"
            aria-label={`${link.label} link not configured`}
            title={`${link.label} link not configured`}
          >
            {link.brand && <SocialMark brand={link.brand} />}
          </span>
        )
      )}
    </div>
  );
}
