import { controlAction, runtimeLlmAction } from "@mobility/contracts";
import { authorize } from "../auth";
import { accountAction } from "./accounts";
import { catalogAction } from "./catalog";
import { boundedText, ControlError, controlError } from "./errors";
import { controlIdentity } from "./identity";
import { drainAccountMail } from "./mail";
import {
  currentSelection,
  prepareSelection,
  runtimeSelection,
} from "./selection";
import { snapshot } from "./snapshot";

export function authorizeControlService(request: Request) {
  return authorize(
    request,
    {
      secret: process.env.MOBILITY_JWT_SECRET ?? "",
      issuer: process.env.MOBILITY_JWT_ISSUER ?? "",
      audience: process.env.MOBILITY_JWT_AUDIENCE ?? "",
    },
    "mobility.evaluation.manage",
  );
}
export async function handleControl(request: Request, runtime = false) {
  const service = await authorizeControlService(request);
  if (service instanceof Response) return service;
  try {
    const value: unknown = JSON.parse(await boundedText(request));
    if (runtime) {
      const input = runtimeLlmAction.safeParse(value);
      if (!input.success) throw new ControlError("invalid_request");
      return Response.json(await runtimeSelection(input.data), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    const input = controlAction.safeParse(value);
    if (!input.success) throw new ControlError("invalid_request");
    const identity = await controlIdentity(request.headers);
    let result: unknown;
    if (input.data.action === "snapshot")
      result = await snapshot(identity, input.data.admin);
    else if (input.data.action === "selection.prepare")
      result = await prepareSelection(input.data, identity.id);
    else if (input.data.action === "selection.current")
      result = await currentSelection(identity.id, input.data.sessionId);
    else if (
      /^(?:user\.|settings\.|attempt\.|mail\.|reauth)/.test(input.data.action)
    )
      result = await accountAction(input.data, identity, request.headers);
    else result = await catalogAction(input.data, identity);
    if (
      ["user.invite", "user.recover", "mail.retry"].includes(input.data.action)
    )
      await drainAccountMail();
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return controlError(error);
  }
}
