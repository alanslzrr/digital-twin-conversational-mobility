import { Conversations } from "../../_components/views";
export default async function Page({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <Conversations sessionId={sessionId} />;
}
