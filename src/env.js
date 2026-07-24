// Imported first so .env is applied before telemetry reads its endpoint.
// Real environment variables win over .env values.
try {
  process.loadEnvFile('.env');
} catch {
  /* no .env file; env comes from the shell */
}
