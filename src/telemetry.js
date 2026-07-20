import { NodeTracerProvider, BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { trace } from '@opentelemetry/api';

const endpoint = process.env.SIGNOZ_OTLP_ENDPOINT;

const provider = new NodeTracerProvider({
  resource: new Resource({
    'service.name': 'devswarm',
    'service.version': '0.1.0'
  }),
  spanProcessors: [
    new BatchSpanProcessor(
      endpoint
        ? new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/traces` })
        : new ConsoleSpanExporter()
    )
  ]
});
provider.register();

if (!endpoint) {
  console.log('[telemetry] SIGNOZ_OTLP_ENDPOINT not set, spans go to console. Set it to e.g. http://localhost:4318');
}

export const tracer = trace.getTracer('devswarm');
