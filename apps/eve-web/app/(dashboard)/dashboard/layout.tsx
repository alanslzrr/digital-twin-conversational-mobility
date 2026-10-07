import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardProvider } from "../../../src/dashboard-client";
import { readIdentity } from "../../../src/evaluator-auth";
import { DashboardShell } from "./_components/shell";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const identity = await readIdentity(
    new Request("http://internal/dashboard", { headers: await headers() }),
  );
  if (!identity) redirect("/evaluation");
  return (
    <DashboardProvider key={identity.principalId} identity={identity}>
      <DashboardShell>{children}</DashboardShell>
    </DashboardProvider>
  );
}
