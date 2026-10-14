import { traceEnrichmentEnabled } from "@mobility/contracts";
import { otel } from "eve/instrumentation/otel";

export default otel({
  functionId: "mobai",
  traceChannelRequests: false,
  // No automatic HTTP/SQL capture or propagation of baggage/provider headers.
  instrumentations: [],
  propagators: ["none"],
  sampler: "always_on",
  tracePolicy: () => ({
    emit: traceEnrichmentEnabled(process.env),
    recordInputs: false,
    recordOutputs: false,
  }),
});
