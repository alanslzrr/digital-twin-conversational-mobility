import { withEve } from "eve/next";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  poweredByHeader: false,
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");
export default withEve(withNextIntl(nextConfig));
