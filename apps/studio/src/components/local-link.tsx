"use client";

import NextLink from "next/link";
import type { ComponentProps } from "react";

/** Every local section renders the same client workspace. Speculatively fetching
 * its server shell provides no project data and races document reload in WebKit. */
export default function LocalLink(props: ComponentProps<typeof NextLink>) {
  return <NextLink {...props} prefetch={false} />;
}
