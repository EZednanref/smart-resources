





const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class MetricsCollector {
  constructor() {
    this.previousCpuUsage = this.getCpuUsage();
    this.processes = [];
  }
  getCpuUsage() {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;
    cpus.forEach(cpu => {
      for (let type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });
    return {
      idle: totalIdle / cpus.length,
      total: totalTick / cpus.length
    };
  }
  async getCpuPercentage() {
    return new Promise((resolve) => {
      setTimeout(() => {
        const currentUsage = this.getCpuUsage();
        const idleDiff = currentUsage.idle - this.previousCpuUsage.idle;
        const totalDiff = currentUsage.total - this.previousCpuUsage.total;
        const cpuPercentage = 100 - (100 * idleDiff / totalDiff);
        this.previousCpuUsage = currentUsage;
        resolve(Math.max(0, Math.min(100, cpuPercentage)));
      }, 100);
    });
  }

  getMemoryUsage() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPercentage = (usedMem / totalMem) * 100;
    return {
      total: totalMem,
      free: freeMem,
      used: usedMem,
      percentage: memPercentage
    };
  }

  async getProcesses() {
    const platform = os.platform();
    try {
      if (platform === 'linux') {
        return await this.getLinuxProcesses();
      } else if (platform === 'darwin') {
        return await this.getMacProcesses();
      } else if (platform === 'win32') {
        return await this.getWindowsProcesses();
      }
    } catch (error) {
      console.error('Erreur lors de la récupération des processus:', error);
      return [];
    }
  }
  async getLinuxProcesses() {
    const { stdout } = await execAsync(
      "ps aux --sort=-%cpu | head -n 20 | awk '{print $2,$3,$4,$11}'"
    );

    const lines = stdout.trim().split('\n').slice(1); // Skip header
    return lines.map(line => {

      const [pid, cpu, mem, name] = line.trim().split(/\s+/);
      return {
        pid: parseInt(pid),
        name: name.split('/').pop(),
        cpu: parseFloat(cpu),
        memory: parseFloat(mem)
      };
    });
  }
  async getMacProcesses() {
    const { stdout } = await execAsync(
      "ps aux | sort -rk 3,3 | head -n 20 | awk '{print $2,$3,$4,$11}'"
    );

    const lines = stdout.trim().split('\n').slice(1);
    return lines.map(line => {
      const [pid, cpu, mem, name] = line.trim().split(/\s+/);
      return {
        pid: parseInt(pid),
        name: name.split('/').pop(),
        cpu: parseFloat(cpu),
        memory: parseFloat(mem)
      };
    });
  }
  async getWindowsProcesses() {
    const { stdout } = await execAsync(
      'powershell "Get-Process | Sort-Object CPU -Descending | Select-Object -First 20 | Format-Table -Property Id,ProcessName,CPU,WorkingSet -HideTableHeaders"'
    );

    const lines = stdout.trim().split('\n');
    return lines.map(line => {
      const parts = line.trim().split(/\s+/);
      const pid = parseInt(parts[0]);
      const name = parts[1];
      const cpu = parseFloat(parts[2]) || 0;
      const memBytes = parseInt(parts[3]) || 0;
      const memPercentage = (memBytes / os.totalmem()) * 100;

      return {
        pid,
        name,
        cpu: Math.min(cpu / 10, 100), // Normaliser
        memory: memPercentage
      };
    });
  }

  async getAllMetrics() {
    const [cpuPercentage, processes] = await Promise.all([
      this.getCpuPercentage(),
      this.getProcesses()
    ]);
    const memory = this.getMemoryUsage();
    return {
      cpu: {
        percentage: cpuPercentage,
        cores: os.cpus().length
      },
      memory: {
        percentage: memory.percentage,
        used: memory.used,
        total: memory.total,
        free: memory.free
      },
      processes: processes,
      system: {
        platform: os.platform(),
        hostname: os.hostname(),
        uptime: os.uptime()
      },
      timestamp: Date.now()
    };
  }
}

module.exports = MetricsCollector;
