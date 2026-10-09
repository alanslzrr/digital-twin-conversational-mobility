import { handleControl } from "../../../src/control/service";
export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = (request: Request) => handleControl(request);
