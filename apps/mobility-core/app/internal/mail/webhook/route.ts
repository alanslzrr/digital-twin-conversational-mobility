import { boundedText, controlError } from "../../../../src/control/errors";
import { acceptMailEvent } from "../../../../src/control/mail";
import { authorizeControlService } from "../../../../src/control/service";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const service = await authorizeControlService(request);
  if (service instanceof Response) return service;
  try {
    await acceptMailEvent(await boundedText(request, 65536), request.headers);
    return new Response(null, { status: 204 });
  } catch (error) {
    return controlError(error);
  }
}
