import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  transpilePackages: [
    "@mobility/contracts",
    "@mobility/domain",
    "@mobility/provenance",
  ],
};
export default config;
