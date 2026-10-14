import { disableInstrumentation } from "eve/instrumentation";

// Never export conversations to Vercel, including preview/production defaults.
export default disableInstrumentation();
