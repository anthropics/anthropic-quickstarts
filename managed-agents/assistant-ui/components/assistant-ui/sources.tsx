"use client";

import { memo, useState, type ComponentProps } from "react";
import { FileTextIcon } from "lucide-react";
import type { VariantProps } from "class-variance-authority";
import type { SourceMessagePartComponent } from "@assistant-ui/react";
import { cn } from "@/lib/utils";
import { Badge, badgeVariants } from "./badge";

const extractDomain = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const defaultFaviconUrl = (domain: string) =>
  `https://icons.duckduckgo.com/ip3/${domain}.ico`;

function SourceIcon({
  url,
  className,
  faviconUrl = defaultFaviconUrl,
  ...props
}: ComponentProps<"span"> & {
  url: string;
  faviconUrl?: (domain: string) => string;
}) {
  const domain = extractDomain(url);
  const src = faviconUrl(domain);
  const [errorSrc, setErrorSrc] = useState<string | undefined>(undefined);
  const hasError = errorSrc === src;

  if (hasError) {
    return (
      <span
        data-slot="source-icon-fallback"
        className={cn(
          "bg-muted flex size-3 shrink-0 items-center justify-center rounded-sm text-[10px] font-medium",
          className,
        )}
        {...props}
      >
        {domain.charAt(0).toUpperCase() || "?"}
      </span>
    );
  }

  return (
    <img
      data-slot="source-icon"
      src={src}
      alt=""
      className={cn("size-3 shrink-0 rounded-sm", className)}
      onError={() => setErrorSrc(src)}
      {...(props as ComponentProps<"img">)}
    />
  );
}

function SourceTitle({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="source-title"
      className={cn("max-w-37.5 truncate", className)}
      {...props}
    />
  );
}

function DocumentSourceIcon({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="source-document-icon"
      className={cn(
        "text-muted-foreground flex size-3 shrink-0 items-center justify-center",
        className,
      )}
      {...props}
    >
      <FileTextIcon className="size-3" />
    </span>
  );
}

export type SourceProps = ComponentProps<"a"> &
  VariantProps<typeof badgeVariants>;

function Source({
  className,
  variant,
  size,
  target = "_blank",
  rel = "noopener noreferrer",
  ...props
}: SourceProps) {
  return (
    <a
      data-slot="source"
      className={cn(
        badgeVariants({ variant, size }),
        "focus-visible:border-ring focus-visible:ring-ring/50 cursor-pointer outline-none focus-visible:ring-[3px]",
        className,
      )}
      target={target}
      rel={rel}
      {...props}
    />
  );
}

const SourcesImpl: SourceMessagePartComponent = (part) => {
  if (part.sourceType === "url" && part.url) {
    const domain = extractDomain(part.url);
    const displayTitle = part.title || domain;

    return (
      <Source href={part.url}>
        <SourceIcon url={part.url} />
        <SourceTitle>{displayTitle}</SourceTitle>
      </Source>
    );
  }

  if (part.sourceType === "document") {
    return (
      <Badge
        variant="secondary"
        className="focus-visible:border-ring focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]"
      >
        <span data-slot="source" className="inline-flex items-center gap-1.5">
          <DocumentSourceIcon />
          <SourceTitle>{part.title}</SourceTitle>
        </span>
      </Badge>
    );
  }

  return null;
};

const Sources = memo(SourcesImpl) as unknown as SourceMessagePartComponent & {
  Root: typeof Source;
  Icon: typeof SourceIcon;
  Title: typeof SourceTitle;
};

Sources.displayName = "Sources";
Sources.Root = Source;
Sources.Icon = SourceIcon;
Sources.Title = SourceTitle;

export {
  Sources,
  Source,
  SourceIcon,
  SourceTitle,
  badgeVariants as sourceVariants,
};
