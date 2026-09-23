import { localDev } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";

// Fail closed outside local development. Do not enable production access until
// evaluator identity AND per-session ownership authorization are implemented.
export default eveChannel({ auth: [localDev()], uploadPolicy: "disabled" });
