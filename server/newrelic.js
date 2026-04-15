/**
 * New Relic APM Configuration
 * @description Configures New Relic Node.js agent for APM monitoring
 * @see https://docs.newrelic.com/docs/apm/agents/nodejs-agent/installation-configuration/nodejs-agent-install/
 */

"use strict";

// Ensure environment variables are loaded
require("dotenv").config();

exports.config = {
  // Application name
  app_name: [process.env.NEW_RELIC_APP_NAME || "Quiz Platform Server"],

  // License key - pulled from environment variable
  license_key: process.env.NEW_RELIC_LICENSE_KEY || "",

  // Logging config
  logging: {
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
    enabled: process.env.NEW_RELIC_LOG_ENABLED !== "false",
    filepath: "stdout",
  },

  // Advanced configuration
  agent_enabled: process.env.NEW_RELIC_ENABLED !== "false",

  // Auditlog
  auditlog: {
    enabled: false,
  },

  // Distributed tracing
  distributed_tracing: {
    enabled: true,
  },

  // Transaction events
  transaction_events: {
    enabled: true,
    max_samples_stored: 1200,
  },

  // Record SQL queries (be careful with sensitive data)
  transaction_tracer: {
    record_sql: "obfuscated",
    explain_threshold: 500,
    enabled: true,
    max_segments: 500,
    trace_threshold: "apdex_f",
  },

  // Custom instrumentation
  instrumentation: {
    modules: {
      express: true,
      "express-rate-limit": false,
      mysql2: true,
    },
  },

  // Error collection
  error_collector: {
    enabled: true,
    capture_events: true,
    max_event_samples_stored: 100,
  },

  // API host
  host: process.env.NEW_RELIC_HOST || "collector.newrelic.com",

  // Proxy configuration (if needed)
  proxy: process.env.NEW_RELIC_PROXY || undefined,

  // SSL settings
  ssl: true,

  // Attributes
  attributes: {
    enabled: true,
    exclude: ["request.headers.authorization", "request.headers.cookie"],
  },

  // Server-side config (set via New Relic UI)
  high_security: process.env.NEW_RELIC_HIGH_SECURITY === "true",
};

// Only load newrelic if license key is provided
if (!process.env.NEW_RELIC_LICENSE_KEY) {
  exports.config.agent_enabled = false;
}
