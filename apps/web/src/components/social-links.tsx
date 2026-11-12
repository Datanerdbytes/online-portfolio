import Image from "next/image";
import {
  faDiscord,
  faFacebookF,
  faGithub,
  faInstagram,
  faSlack,
  faThreads,
  faXTwitter,
} from "@fortawesome/free-brands-svg-icons";

type SocialBrand =
  | "github"
  | "tableau"
  | "slack"
  | "discord"
  | "facebook"
  | "instagram"
  | "x"
  | "threads";

const BRAND_ICONS = {
  github: faGithub,
  slack: faSlack,
  discord: faDiscord,
  facebook: faFacebookF,
  instagram: faInstagram,
  x: faXTwitter,
  threads: faThreads,
} as const;

// Brand colors for logos that are not black. Black logo brands (github, x,
// threads) keep the adaptive currentColor so they stay visible in dark mode.
const BRAND_FILLS: Partial<Record<Exclude<SocialBrand, "tableau">, string>> = {
  facebook: "#0866FF",
  slack: "#4A154B",
  discord: "#5865F2",
};

// Instagram's recognizable look is its official diagonal gradient, so it
// carries its own paint server instead of a flat color.
const INSTAGRAM_GRADIENT_ID = "instagram-brand-gradient";

const INSTAGRAM_GRADIENT_STOPS = [
  { offset: "0%", color: "#FEDA75" },
  { offset: "25%", color: "#FA7E1E" },
  { offset: "50%", color: "#D62976" },
  { offset: "75%", color: "#962FBF" },
  { offset: "100%", color: "#4F5BD5" },
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
  if (
    normalizedLabel.includes("facebook") ||
    hostname === "facebook.com" ||
    hostname === "fb.com" ||
    hostname === "fb.me" ||
    hostname.endsWith(".facebook.com")
  )
    return "facebook";
  if (
    normalizedLabel.includes("instagram") ||
    hostname === "instagram.com" ||
    hostname === "instagr.am" ||
    hostname.endsWith(".instagram.com")
  )
    return "instagram";
  if (
    normalizedLabel === "x" ||
    normalizedLabel.includes("twitter") ||
    hostname === "x.com" ||
    hostname === "twitter.com" ||
    hostname.endsWith(".x.com") ||
    hostname.endsWith(".twitter.com")
  )
    return "x";
  if (
    normalizedLabel.includes("threads") ||
    hostname === "threads.net" ||
    hostname === "threads.com" ||
    hostname.endsWith(".threads.net") ||
    hostname.endsWith(".threads.com")
  )
    return "threads";
  return null;
}

function SocialMark({ brand }: { brand: Exclude<SocialBrand, "tableau"> }) {
  const icon = BRAND_ICONS[brand];
  const [width, height, , , pathData] = icon.icon;
  const paths = Array.isArray(pathData) ? pathData : [pathData];
  const isInstagram = brand === "instagram";
  const fill = isInstagram
    ? `url(#${INSTAGRAM_GRADIENT_ID})`
    : BRAND_FILLS[brand];
  return (
    <svg
      className="masthead-social-mark"
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
      style={fill ? { fill } : undefined}
    >
      {isInstagram && (
        <defs>
          <linearGradient
            id={INSTAGRAM_GRADIENT_ID}
            x1="0"
            y1="1"
            x2="1"
            y2="0"
          >
            {INSTAGRAM_GRADIENT_STOPS.map((stop) => (
              <stop
                key={stop.offset}
                offset={stop.offset}
                stopColor={stop.color}
              />
            ))}
          </linearGradient>
        </defs>
      )}
      {paths.map((path, index) => (
        <path d={path} key={index} />
      ))}
    </svg>
  );
}

export function SocialLinks({
  links,
  className = "masthead-socials",
}: {
  links: { label: string; url: string }[];
  className?: string;
}) {
  const items = links.map((link) => ({
    ...link,
    brand: identifySocialBrand(link.label, link.url),
  }));

  if (!items.length) return null;

  return (
    <div role="group" aria-label="Social profiles" className={className}>
      {items.map((link, index) => (
        <a
          key={`${index}:${link.label}:${link.url}`}
          className="masthead-social-link"
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={link.label}
          title={link.label}
        >
          {link.brand && link.brand !== "tableau" ? (
            <SocialMark brand={link.brand} />
          ) : link.brand === "tableau" ? (
            <Image
              className="masthead-social-tableau"
              src="/brands/tableau.png"
              alt=""
              width={24}
              height={24}
              aria-hidden="true"
            />
          ) : (
            <span>{link.label}</span>
          )}
        </a>
      ))}
    </div>
  );
}
