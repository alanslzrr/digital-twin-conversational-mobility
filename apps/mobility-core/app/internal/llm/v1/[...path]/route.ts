import { ControlError, controlError } from "../../../../../src/control/errors";
import { proxyInference } from "../../../../../src/control/proxy";
import { authorizeControlService } from "../../../../../src/control/service";
export const runtime = "nodejs";
export const maxDuration = 90;
export async function POST(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const service = await authorizeControlService(request);
  if (service instanceof Response) return service;
  try {
    const path = (await context.params).path.join("/");
    if (path !== "responses" && path !== "chat/completions")
      throw new ControlError("not_found", 404);
    return await proxyInference(
      request,
      path === "responses" ? "responses" : "chat-completions",
    );
  } catch (error) {
    return controlError(error);
  }
}
