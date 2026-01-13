const express = require('express');
const client = require('prom-client');
const cors = require('cors');
const MetricsCollector = require('./metricsCollector');

const app = express();
const PORT = 3000;

// Enable CORS pour permettre au widget HTML de se connecter
app.use(cors());
app.use(express.json());

// Créer le registre Prometheus
const register = new client.Registry();

// Métriques par défaut Node.js
client.collectDefaultMetrics({ register });

// Métriques personnalisées
const systemCpuGauge = new client.Gauge({
  name: 'system_cpu_usage_percent',
  help: 'CPU usage percentage'
});

const systemMemoryGauge = new client.Gauge({
  name: 'system_memory_usage_percent',
  help: 'Memory usage percentage'
});

const systemMemoryBytesGauge = new client.Gauge({
  name: 'system_memory_usage_bytes',
  help: 'Memory usage in bytes',
  labelNames: ['type']
});

const processCpuGauge = new client.Gauge({
  name: 'process_cpu_usage_percent',
  help: 'CPU usage per process',
  labelNames: ['pid', 'name']
});

const processMemoryGauge = new client.Gauge({
  name: 'process_memory_usage_percent',
  help: 'Memory usage per process',
  labelNames: ['pid', 'name']
});

const systemInfoGauge = new client.Gauge({
  name: 'system_info',
  help: 'System information',
  labelNames: ['platform', 'hostname', 'cores']
});

// Enregistrer les métriques
register.registerMetric(systemCpuGauge);
register.registerMetric(systemMemoryGauge);
register.registerMetric(systemMemoryBytesGauge);
register.registerMetric(processCpuGauge);
register.registerMetric(processMemoryGauge);
register.registerMetric(systemInfoGauge);

// Créer le collecteur
const collector = new MetricsCollector();

// Fonction pour mettre à jour les métriques
async function updateMetrics() {
  try {
    const metrics = await collector.getAllMetrics();

    // Mettre à jour les métriques système
    systemCpuGauge.set(metrics.cpu.percentage);
    systemMemoryGauge.set(metrics.memory.percentage);
    
    systemMemoryBytesGauge.set({ type: 'used' }, metrics.memory.used);
    systemMemoryBytesGauge.set({ type: 'free' }, metrics.memory.free);
    systemMemoryBytesGauge.set({ type: 'total' }, metrics.memory.total);

    // Info système
    systemInfoGauge.set({
      platform: metrics.system.platform,
      hostname: metrics.system.hostname,
      cores: metrics.cpu.cores.toString()
    }, 1);

    // Réinitialiser les métriques des processus
    processCpuGauge.reset();
    processMemoryGauge.reset();

    // Mettre à jour les métriques des processus
    metrics.processes.forEach(proc => {
      const labels = { pid: proc.pid.toString(), name: proc.name };
      processCpuGauge.set(labels, proc.cpu);
      processMemoryGauge.set(labels, proc.memory);
    });

  } catch (error) {
    console.error('Erreur mise à jour métriques:', error);
  }
}

// Mettre à jour les métriques toutes les 2 secondes
setInterval(updateMetrics, 2000);
updateMetrics(); // Première mise à jour immédiate

// Endpoint Prometheus /metrics
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    res.status(500).end(error);
  }
});

// Endpoint JSON pour le widget HTML
app.get('/api/metrics', async (req, res) => {
  try {
    const metrics = await collector.getAllMetrics();
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`📊 Prometheus metrics: http://localhost:${PORT}/metrics`);
  console.log(`📈 JSON API: http://localhost:${PORT}/api/metrics`);
  console.log(`💚 Health check: http://localhost:${PORT}/health`);
});
