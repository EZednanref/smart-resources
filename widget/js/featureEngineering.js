// =============================================================================
// Installation requise:
// npm install @tensorflow/tfjs-node express prom-client cors
// =============================================================================

// featureEngineering.js
class FeatureEngineer {
  constructor() {
    this.history = [];
    this.processHistory = [];
    this.windowSize = 60;
  }

  extractFeatures(currentData) {
    this.history.push({
      cpu: currentData.cpu.percentage,
      ram: currentData.memory.percentage,
      timestamp: Date.now()
    });

    if (this.history.length > this.windowSize) {
      this.history.shift();
    }

    if (this.history.length < 5) {
      // Features par défaut si pas assez d'historique
      return new Array(26).fill(0);
    }

    const cpuValues = this.history.map(h => h.cpu);
    const ramValues = this.history.map(h => h.ram);
    const currentProcesses = currentData.processes || [];
    
    const previousPids = new Set(this.processHistory.map(p => p.pid));
    const currentPids = new Set(currentProcesses.map(p => p.pid));
    
    const newProcessCount = [...currentPids].filter(pid => !previousPids.has(pid)).length;
    const terminatedCount = [...previousPids].filter(pid => !currentPids.has(pid)).length;
    
    this.processHistory = currentProcesses;

    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();
    const isWorkingHours = hour >= 9 && hour <= 18 && dayOfWeek >= 1 && dayOfWeek <= 5;

    return [
      // Métriques actuelles
      currentData.cpu.percentage / 100,
      currentData.memory.percentage / 100,
      
      // Statistiques CPU
      this.mean(cpuValues) / 100,
      this.std(cpuValues) / 100,
      Math.min(...cpuValues) / 100,
      Math.max(...cpuValues) / 100,
      
      // Statistiques RAM
      this.mean(ramValues) / 100,
      this.std(ramValues) / 100,
      Math.min(...ramValues) / 100,
      Math.max(...ramValues) / 100,
      
      // Tendances
      this.linearTrend(cpuValues) / 100,
      this.linearTrend(ramValues) / 100,
      this.acceleration(cpuValues) / 100,
      this.acceleration(ramValues) / 100,
      
      // Processus
      currentProcesses.length / 100,
      newProcessCount / 10,
      terminatedCount / 10,
      (currentProcesses[0]?.cpu || 0) / 100,
      (currentProcesses[0]?.memory || 0) / 100,
      this.entropy(cpuValues),
      
      // Temporel
      hour / 24,
      dayOfWeek / 7,
      isWorkingHours ? 1 : 0,
      (process.uptime() / 86400) % 1,
      
      // Dérivé
      this.correlation(cpuValues, ramValues),
      (currentData.cpu.percentage + currentData.memory.percentage) / 200
    ];
  }

  mean(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  std(arr) {
    const m = this.mean(arr);
    return Math.sqrt(arr.reduce((sq, n) => sq + Math.pow(n - m, 2), 0) / arr.length);
  }

  linearTrend(arr) {
    const n = arr.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = arr.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * arr[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  }

  acceleration(arr) {
    if (arr.length < 3) return 0;
    const n = arr.length;
    return arr[n - 1] - 2 * arr[n - 2] + arr[n - 3];
  }

  correlation(x, y) {
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
    const num = n * sumXY - sumX * sumY;
    const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    return den === 0 ? 0 : num / den;
  }

  entropy(arr) {
    const bins = 10;
    const max = Math.max(...arr, 1);
    const hist = new Array(bins).fill(0);
    arr.forEach(v => {
      const bin = Math.min(Math.floor((v / max) * bins), bins - 1);
      hist[bin]++;
    });
    const total = arr.length;
    return -hist.reduce((h, c) => {
      if (c === 0) return h;
      const p = c / total;
      return h + p * Math.log2(p);
    }, 0) / Math.log2(bins);
  }
}


