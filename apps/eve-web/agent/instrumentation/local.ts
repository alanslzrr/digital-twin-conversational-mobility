import { disableInstrumentation } from "eve/instrumentation";

// Core is the only telemetry store. Do not create EVE's second local trace spool.
export default disableInstrumentation();
