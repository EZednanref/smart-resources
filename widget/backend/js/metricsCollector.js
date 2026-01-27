const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

class MetricsCollector {
  constructor() {
    this.previousCpuUsage = this.getCpuUsage();
    this.processes = [];
    // Détecter si on est dans Docker avec accès à /proc de l'hôte
    this.hostProc = process.env.HOST_PROC || '/proc';
    this.isDocker = process.env.HOST_PROC ? true : false;
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
    // Si on a accès à /proc de l'hôte -> on appelle getProcessesFromProc
    if (this.isDocker && platform === 'linux') {
      return await this.getProcessesFromProc();
    }
    
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
  
  // lire directement depuis /proc
  async getProcessesFromProc() {
    try {
      const pids = await fs.readdir(this.hostProc);
      const processes = [];
      

      // La on va récuperer toutes les stats de chaque processus, comme ça au lieu d'avoir la ram totale / cpu total,
      // on a la valeur spécifique à chaque processus.
      // c'est mieux pour l'entrainement du modèle.
      for (const pid of pids) {
        // Ne garder que les PIDs numériques
        if (!/^\d+$/.test(pid)) continue;
        
        try {
          // Pour accéder à tous les processus de l'hôte
          const statPath = path.join(this.hostProc, pid, 'stat');
          const cmdlinePath = path.join(this.hostProc, pid, 'cmdline');
          const stat = await fs.readFile(statPath, 'utf8');
          let cmdline = '';
          try {
            cmdline = await fs.readFile(cmdlinePath, 'utf8');
            cmdline = cmdline.replace(/\0/g, ' ').trim();
          } catch (e) {
          }
          
          const statMatch = stat.match(/\d+\s+\((.+?)\)\s+\S+\s+(\S+.*)/);
          if (!statMatch) continue;
          
          const name = cmdline || statMatch[1];
          const statFields = statMatch[2].split(/\s+/);
          
          // CPU time (user + system)
          const utime = parseInt(statFields[11]) || 0;
          const stime = parseInt(statFields[12]) || 0;
          const cpuTime = utime + stime;
          
          // Memory (RSS en pages)
          const rss = parseInt(statFields[21]) || 0;
          const memoryBytes = rss * 4096; // Page size = 4KB
          const totalMem = os.totalmem();
          const memoryPercent = (memoryBytes / totalMem) * 100;
          
          processes.push({
            pid: parseInt(pid),
            name: name.split('/').pop().substring(0, 50),
            cpu: 0,
            memory: memoryPercent
          });
          
        } catch (e) {
          continue;
        }
      }
      console.log('[DEBUG]');
      console.log(`Processus lus depuis /proc: ${processes.length}`);
      return processes.sort((a, b) => b.memory - a.memory);
      
    } catch (error) {
      console.log('[ERROR]');
      console.error('Erreur lecture /proc:', error);
      return [];
    }
  }
  
  async getLinuxProcesses() {
    try {
      // Si on est en mode Docker, utiliser nsenter pour exécuter ps sur l'hôte
      let command;
      if (this.isDocker) {

        console.log('[DEBUG]');
        console.log('Utilisation de nsenter pour accéder aux processus de l\'hôte');
        command = "nsenter -t 1 -m -u -n -i ps -eo pid,pcpu,pmem,comm --sort=-pcpu";
      } else {
        command = "ps -eo pid,pcpu,pmem,comm --sort=-pcpu";
      }
      
      console.log('[DEBUG]');
      console.log(`Commande: ${command}`);
      const { stdout } = await execAsync(command);
      
      const lines = stdout.trim().split('\n').slice(1);
      console.log('[DEBUG]');
      console.log(`Nombre de lignes trouvées: ${lines.length}`);

      const processes = lines.map(line => {
        const parts = line.trim().split(/\s+/);
        const pid = parseInt(parts[0]);
        const cpu = parseFloat(parts[1]) || 0;
        const mem = parseFloat(parts[2]) || 0;
        const name = parts.slice(3).join(' ') || 'unknown';
        
        return { pid, name, cpu, memory: mem };
      }).filter(p => p.pid && !isNaN(p.pid));

      console.log('[DEBUG]');
      console.log(`Processus parsés: ${processes.length}`);
      return processes;
      
    } catch (error) {

      console.log('[ERROR]');
      console.error('Erreur ps:', error.message);
      
      if (this.isDocker) {
        // console.log('Fallback sur lecture /proc');
        return await this.getProcessesFromProc();
      }
      return [];
    }
  }
  
  async getMacProcesses() {
    const { stdout } = await execAsync(
      "ps aux | awk '{print $2,$3,$4,$11}'"
    );

    const lines = stdout.trim().split('\n').slice(1);
    return lines.map(line => {
      const [pid, cpu, mem, name] = line.trim().split(/\s+/);
      return {
        pid: parseInt(pid),
        name: name ? name.split('/').pop() : 'unknown',
        cpu: parseFloat(cpu) || 0,
        memory: parseFloat(mem) || 0
      };
    }).filter(p => p.pid && !isNaN(p.pid));
  }
  
  async getWindowsProcesses() {
    const { stdout } = await execAsync(
      'powershell "Get-Process | Sort-Object CPU -Descending | Format-Table -Property Id,ProcessName,CPU,WorkingSet -HideTableHeaders"'
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
        cpu: Math.min(cpu / 10, 100),
        memory: memPercentage
      };
    }).filter(p => p.pid && !isNaN(p.pid));
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
