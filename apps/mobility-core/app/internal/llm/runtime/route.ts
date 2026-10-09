import { handleControl } from "../../../../src/control/service";
export const runtime = "nodejs";
export const POST = (request: Request) => handleControl(request, true);
