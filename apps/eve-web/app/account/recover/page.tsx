import type { Metadata } from "next";
import { Recovery } from "./recovery";
export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export default function RecoveryPage() {
  return <Recovery />;
}
