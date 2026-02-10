import fs from 'fs';
import path from 'path';

const TIME_ZONE = 'Asia/Shanghai';

const getTimestamp = () => new Date().toLocaleString('zh-CN', { timeZone: TIME_ZONE, hour12: false });

const dateStampFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const getDateStamp = () => dateStampFormatter.format(new Date());

class DailyFileSink {
  private readonly enabled: boolean;
  private readonly logDir: string;
  private readonly retentionDays: number;
  private stream: fs.WriteStream | null = null;
  private currentDateStamp: string | null = null;
  private lastPruneAtMs = 0;

  constructor() {
    const enabledRaw = (process.env.LOG_FILE_ENABLED ?? process.env.LOG_TO_FILE ?? '1').trim();
    this.enabled = enabledRaw === '1' || enabledRaw.toLowerCase() === 'true';
    this.retentionDays = Math.max(
      1,
      parseInt(String(process.env.LOG_RETENTION_DAYS || '7'), 10) || 7
    );
    this.logDir = (process.env.LOG_DIR && String(process.env.LOG_DIR).trim())
      ? String(process.env.LOG_DIR).trim()
      : path.join(process.cwd(), 'data', 'logs');

    if (!this.enabled) return;

    try {
      fs.mkdirSync(this.logDir, { recursive: true });
    } catch {
      this.stream = null;
      this.currentDateStamp = null;
      (this as any).enabled = false;
      return;
    }

    this.rotateIfNeeded();
    this.pruneIfDue(true);
  }

  write(line: string) {
    if (!this.enabled) return;
    this.rotateIfNeeded();
    this.pruneIfDue(false);
    try {
      this.stream?.write(line + '\n');
    } catch {
    }
  }

  private rotateIfNeeded() {
    if (!this.enabled) return;
    const today = getDateStamp();
    if (this.currentDateStamp === today && this.stream) return;

    try {
      this.stream?.end();
    } catch {
    }

    this.currentDateStamp = today;
    const filePath = path.join(this.logDir, `app-${today}.log`);
    try {
      this.stream = fs.createWriteStream(filePath, { flags: 'a' });
      this.stream.on('error', () => {});
    } catch {
      this.stream = null;
    }
  }

  private pruneIfDue(force: boolean) {
    const now = Date.now();
    if (!force && now - this.lastPruneAtMs < 60 * 60 * 1000) return;
    this.lastPruneAtMs = now;

    const cutoffMs = now - this.retentionDays * 24 * 60 * 60 * 1000;
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(this.logDir);
    } catch {
      return;
    }

    for (const name of entries) {
      const m = /^app-(\d{4}-\d{2}-\d{2})\.log$/i.exec(name);
      if (!m) continue;
      const stamp = m[1];
      const t = Date.parse(`${stamp}T00:00:00+08:00`);
      if (!Number.isFinite(t)) continue;
      if (t >= cutoffMs) continue;
      try {
        fs.unlinkSync(path.join(this.logDir, name));
      } catch {
      }
    }
  }
}

const COLORS = {
  RESET: '\x1b[0m',
  BRIGHT: '\x1b[1m',
  DIM: '\x1b[2m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  CYAN: '\x1b[36m',
  WHITE: '\x1b[37m',
  GRAY: '\x1b[90m',
};

class Logger {
  private logs: string[] = [];
  private readonly MAX_LOGS = 1000; // Increased buffer size
  private readonly fileSink = new DailyFileSink();

  private formatMessage(level: string, category: string, ...args: any[]): { raw: string, colored: string } {
    const msg = args
      .map(a => {
        if (a === null || a === undefined) return String(a);
        if (typeof a === 'string') return a;
        if (typeof a === 'object') {
          try {
            return JSON.stringify(a);
          } catch {
            return '[Unserializable]';
          }
        }
        return String(a);
      })
      .join(' ');
    const timestamp = getTimestamp();
    
    let levelColor = COLORS.WHITE;
    let catColor = COLORS.BLUE;

    switch (level) {
      case 'ERROR': levelColor = COLORS.RED; break;
      case 'WARN': levelColor = COLORS.YELLOW; break;
      case 'INFO': levelColor = COLORS.GREEN; break;
    }

    switch (category) {
      case 'SYS': catColor = COLORS.CYAN; break;
      case 'API': catColor = COLORS.BLUE; break;
      case 'APP': catColor = COLORS.GREEN; break;
    }

    const raw = `${timestamp} [${level}] [${category}] ${msg}`;
    const colored = `${COLORS.DIM}${timestamp}${COLORS.RESET} ${levelColor}[${level}]${COLORS.RESET} ${catColor}[${category}]${COLORS.RESET} ${msg}`;

    return { raw, colored };
  }

  private addLog(level: string, category: string, ...args: any[]) {
    const { raw, colored } = this.formatMessage(level, category, ...args);
    
    // Console output (colored)
    if (level === 'ERROR') console.error(colored);
    else if (level === 'WARN') console.warn(colored);
    else console.log(colored);

    this.fileSink.write(raw);

    // Buffer (raw text for API/storage)
    this.logs.unshift(raw);
    if (this.logs.length > this.MAX_LOGS) {
      this.logs.pop();
    }
  }

  info(...args: any[]) { this.addLog('INFO', 'APP', ...args); }
  warn(...args: any[]) { this.addLog('WARN', 'APP', ...args); }
  error(...args: any[]) { this.addLog('ERROR', 'APP', ...args); }
  
  // Specialized loggers
  request(...args: any[]) { this.addLog('INFO', 'API', ...args); }
  system(...args: any[]) { this.addLog('INFO', 'SYS', ...args); }

  getLogs(limit = 100) {
    return this.logs.slice(0, limit);
  }
}

export const logger = new Logger();
