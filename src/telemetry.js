import { NodeTracerProvider, BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { LoggerProvider, BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { Resource } from '@opentelemetry/resources';
import { trace, metrics } from '@opentelemetry/api';

const endpoint = process.env.SIGNOZ_OTLP_ENDPOINT;
const url = (p) => `${endpoint.replace(/\/$/, '')}${p}`;

const resource = new Resource({
  'service.name': 'devswarm',
  'service.version': '0.1.0'
});

// Traces
const provider = new NodeTracerProvider({
  resource,
  spanProcessors: [
    new BatchSpanProcessor(
      endpoint ? new OTLPTraceExporter({ url: url('/v1/traces') }) : new ConsoleSpanExporter()
    )
  ]
});
provider.register();

// Metrics: the swarm's vitals as first-class time series, not just span math.
if (endpoint) {
  const meterProvider = new MeterProvider({
    resource,
    readers: [new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter({ url: url('/v1/metrics') }), exportIntervalMillis: 15000 })]
  });
  metrics.setGlobalMeterProvider(meterProvider);
}
const meter = metrics.getMeter('devswarm');
export const m = {
  tokens: meter.createCounter('devswarm.tokens', { description: 'LLM tokens consumed, by role and model' }),
  llmCalls: meter.createCounter('devswarm.llm.calls', { description: 'LLM calls, by role, model and outcome' }),
  llmDuration: meter.createHistogram('devswarm.llm.duration', { description: 'LLM call duration in seconds', unit: 's' }),
  fallbacks: meter.createCounter('devswarm.fallback.promotions', { description: 'Primary-to-fallback model promotions, by role' }),
  catches: meter.createCounter('devswarm.critic.catches', { description: 'Critic catches, by target and severity' }),
  generations: meter.createCounter('devswarm.generations', { description: 'Completed generations, by verdict' })
};

// Logs: structured swarm events as a third signal alongside traces and metrics.
let logger = null;
if (endpoint) {
  const loggerProvider = new LoggerProvider({ resource });
  loggerProvider.addLogRecordProcessor(new BatchLogRecordProcessor(new OTLPLogExporter({ url: url('/v1/logs') })));
  logger = loggerProvider.getLogger('devswarm');
}
export function slog(severity, body, attributes = {}) {
  const sev = { info: SeverityNumber.INFO, warn: SeverityNumber.WARN, error: SeverityNumber.ERROR }[severity] ?? SeverityNumber.INFO;
  logger?.emit({ severityNumber: sev, severityText: severity.toUpperCase(), body, attributes });
  console.log(`[${severity}]`, body);
}

if (!endpoint) {
  console.log('[telemetry] SIGNOZ_OTLP_ENDPOINT not set, spans go to console, metrics and logs disabled. Set it to e.g. http://localhost:4318');
}

export const tracer = trace.getTracer('devswarm');
