/**
 * HARDWARE TESTING WORKBENCH - MAIN JAVASCRIPT CONTROLLER
 * Full-Stack & Embedded Systems Engineering Architecture
 */

// ==========================================================================
// 1. SERIAL MANAGER (Web Serial API & Physical Connection)
// ==========================================================================
class SerialManager {
  constructor() {
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.isConnected = false;
    this.baudRate = 115200;
    this.rxBytesCount = 0;
    this.lineBuffer = "";
    
    // Callbacks
    this.onLineReceived = null;
    this.onStatusChange = null;
    this.onBytesReceived = null;
  }

  isSupported() {
    return 'serial' in navigator;
  }

  async connect(baudRate = 115200) {
    if (!this.isSupported()) {
      throw new Error("Web Serial API no está disponible en este navegador.");
    }

    try {
      this.baudRate = parseInt(baudRate, 10);
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: this.baudRate });

      this.isConnected = true;
      this.writer = this.port.writable.getWriter();
      
      if (this.onStatusChange) {
        this.onStatusChange(true, "Conectado (USB)");
      }

      this.readLoop();
      return true;
    } catch (err) {
      this.isConnected = false;
      if (this.onStatusChange) {
        this.onStatusChange(false, err.message || "Error al conectar");
      }
      throw err;
    }
  }

  async disconnect() {
    this.isConnected = false;
    try {
      if (this.reader) {
        await this.reader.cancel();
        this.reader.releaseLock();
        this.reader = null;
      }
      if (this.writer) {
        this.writer.releaseLock();
        this.writer = null;
      }
      if (this.port) {
        await this.port.close();
        this.port = null;
      }
    } catch (err) {
      console.warn("Error cerrando puerto serial:", err);
    }
    
    if (this.onStatusChange) {
      this.onStatusChange(false, "Desconectado");
    }
  }

  async readLoop() {
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
    this.reader = textDecoder.readable.getReader();

    try {
      while (this.isConnected) {
        const { value, done } = await this.reader.read();
        if (done) {
          break;
        }
        if (value) {
          this.rxBytesCount += value.length;
          if (this.onBytesReceived) {
            this.onBytesReceived(this.rxBytesCount);
          }
          
          this.lineBuffer += value;
          const lines = this.lineBuffer.split('\n');
          // Mantener el último fragmento incompleto en el buffer
          this.lineBuffer = lines.pop();

          for (const line of lines) {
            const cleanLine = line.trim();
            if (cleanLine && this.onLineReceived) {
              this.onLineReceived(cleanLine);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error en loop de lectura serial:", error);
    } finally {
      if (this.reader) {
        this.reader.releaseLock();
      }
    }
  }

  async send(dataString) {
    if (!this.isConnected || !this.writer) {
      throw new Error("No hay conexión Serial activa.");
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(dataString);
    await this.writer.write(data);
  }
}

// ==========================================================================
// 2. MOCK HARDWARE ENGINE (Virtual Microcontroller Simulator)
// ==========================================================================
class MockHardwareEngine {
  constructor() {
    this.isSimulated = false;
    this.onLineReceived = null;
    this.onStatusChange = null;

    // Simulated State
    this.state = {
      led: 0,
      ledPwm: 128,
      buzzerFreq: 1000,
      relay1: 0,
      relay2: 0,
      servoAngle: 90,
      dcSpeed: 0,
      dcDir: 'STOP',
      dhtTemp: 24.5,
      dhtHum: 58.0,
      ldrRaw: 680
    };
  }

  start() {
    this.isSimulated = true;
    if (this.onStatusChange) {
      this.onStatusChange(true, "Simulador Virtual Activo");
    }
  }

  stop() {
    this.isSimulated = false;
    if (this.onStatusChange) {
      this.onStatusChange(false, "Desconectado");
    }
  }

  send(command) {
    if (!this.isSimulated) return;

    const cmd = command.trim();
    
    // Simular latencia de transmisión de hardware (15-35ms)
    const simulatedLatency = Math.floor(Math.random() * 20) + 15;

    setTimeout(() => {
      let response = "";

      if (cmd === "PING:1" || cmd.startsWith("PING:")) {
        const id = cmd.split(":")[1] || "1";
        response = `PONG:${id}`;
      } else if (cmd.startsWith("SET:LED:")) {
        const val = parseInt(cmd.split(":")[2], 10);
        this.state.led = val;
        response = `ACK:LED:${val}`;
      } else if (cmd.startsWith("SET:LEDBLINK:")) {
        response = `ACK:LEDBLINK:OK`;
      } else if (cmd.startsWith("SET:LEDPWM:")) {
        const val = parseInt(cmd.split(":")[2], 10);
        this.state.ledPwm = val;
        response = `ACK:LEDPWM:${val}`;
      } else if (cmd.startsWith("SET:BUZZER:")) {
        response = `ACK:BUZZER:OK`;
      } else if (cmd.startsWith("SET:RELAY:")) {
        const parts = cmd.split(":");
        const ch = parts[2];
        const val = parts[3];
        if (ch === "1") this.state.relay1 = parseInt(val, 10);
        if (ch === "2") this.state.relay2 = parseInt(val, 10);
        response = `ACK:RELAY:${ch}:${val}`;
      } else if (cmd === "GET:DHT") {
        // Generar pequeñas fluctuaciones aleatorias realistas
        this.state.dhtTemp += (Math.random() * 0.4 - 0.2);
        this.state.dhtHum += (Math.random() * 0.8 - 0.4);
        response = JSON.stringify({
          status: "OK",
          sensor: "DHT22",
          temp: parseFloat(this.state.dhtTemp.toFixed(1)),
          hum: parseFloat(this.state.dhtHum.toFixed(1))
        });
      } else if (cmd === "GET:DIST") {
        const dist = (Math.random() * 15 + 35).toFixed(1);
        response = JSON.stringify({
          status: "OK",
          sensor: "HCSR04",
          dist_cm: parseFloat(dist)
        });
      } else if (cmd === "GET:LDR") {
        this.state.ldrRaw = Math.floor(Math.random() * 60 + 650);
        const percent = ((this.state.ldrRaw / 1023) * 100).toFixed(1);
        response = JSON.stringify({
          status: "OK",
          sensor: "LDR",
          raw: this.state.ldrRaw,
          percent: parseFloat(percent)
        });
      } else if (cmd.startsWith("SET:SERVO:")) {
        const angle = parseInt(cmd.split(":")[2], 10);
        this.state.servoAngle = angle;
        response = `ACK:SERVO:${angle}`;
      } else if (cmd.startsWith("SET:DCMOTOR:")) {
        const parts = cmd.split(":");
        this.state.dcSpeed = parseInt(parts[2], 10);
        this.state.dcDir = parts[3] || 'CW';
        response = `ACK:DCMOTOR:${this.state.dcSpeed}:${this.state.dcDir}`;
      } else {
        response = `ACK:UNKNOWN_CMD`;
      }

      if (this.onLineReceived) {
        this.onLineReceived(response);
      }
    }, simulatedLatency);
  }
}

// ==========================================================================
// 3. TELEMETRY & COMPONENT HEALTH MANAGER
// ==========================================================================
class TelemetryManager {
  constructor() {
    this.limits = {
      relay: 100000,   // Ciclos nominales
      servo: 50000,    // Movimientos nominales
      led: 500000,     // Conmutaciones nominales
      dht: 20000       // Muestreos nominales
    };

    this.metrics = {
      relayCycles: 14,
      relayTimeSec: 252,
      servoCycles: 85,
      servoTimeSec: 760,
      ledCycles: 28,
      ledTimeSec: 1335,
      dhtCycles: 4400,
      dhtTimeSec: 6300
    };

    this.timerInterval = null;
    this.startTimer();
  }

  startTimer() {
    this.timerInterval = setInterval(() => {
      // Incrementar tiempos activos de componentes habilitados
      this.metrics.relayTimeSec += 1;
      this.metrics.servoTimeSec += 1;
      this.metrics.ledTimeSec += 1;
      this.metrics.dhtTimeSec += 1;
      this.updateHealthUI();
    }, 1000);
  }

  recordUsage(component, count = 1) {
    if (component === 'relay') this.metrics.relayCycles += count;
    if (component === 'servo') this.metrics.servoCycles += count;
    if (component === 'led') this.metrics.ledCycles += count;
    if (component === 'dht') this.metrics.dhtCycles += count;

    this.updateHealthUI();
  }

  calculateHealth(cycles, limit) {
    const health = Math.max(0, 100 - (cycles / limit) * 100);
    return parseFloat(health.toFixed(1));
  }

  getHealthCategory(healthPct) {
    if (healthPct >= 80) return { tag: `🟩 ${healthPct}% Óptimo`, css: 'status-optimal', fillCss: 'health-fill-optimal' };
    if (healthPct >= 50) return { tag: `🟨 ${healthPct}% Desgaste`, css: 'status-warning', fillCss: 'health-fill-warning' };
    return { tag: `🟥 ${healthPct}% Crítico`, css: 'status-critical', fillCss: 'health-fill-critical' };
  }

  formatTime(totalSec) {
    const hrs = Math.floor(totalSec / 3600).toString().padStart(2, '0');
    const mins = Math.floor((totalSec % 3600) / 60).toString().padStart(2, '0');
    const secs = (totalSec % 60).toString().padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  }

  updateHealthUI() {
    // Relé
    const rHealth = this.calculateHealth(this.metrics.relayCycles, this.limits.relay);
    const rCat = this.getHealthCategory(rHealth);
    document.getElementById('cnt-relay-cycles').innerText = this.metrics.relayCycles.toLocaleString();
    document.getElementById('cnt-relay-time').innerText = this.formatTime(this.metrics.relayTimeSec);
    const rBadge = document.getElementById('health-badge-relay');
    rBadge.innerText = rCat.tag;
    rBadge.className = `health-badge ${rCat.css}`;
    document.getElementById('bar-health-relay').style.width = `${rHealth}%`;

    // Servo
    const sHealth = this.calculateHealth(this.metrics.servoCycles, this.limits.servo);
    const sCat = this.getHealthCategory(sHealth);
    document.getElementById('cnt-servo-cycles').innerText = this.metrics.servoCycles.toLocaleString();
    document.getElementById('cnt-servo-time').innerText = this.formatTime(this.metrics.servoTimeSec);
    const sBadge = document.getElementById('health-badge-servo');
    sBadge.innerText = sCat.tag;
    sBadge.className = `health-badge ${sCat.css}`;
    document.getElementById('bar-health-servo').style.width = `${sHealth}%`;

    // LED
    const lHealth = this.calculateHealth(this.metrics.ledCycles, this.limits.led);
    const lCat = this.getHealthCategory(lHealth);
    document.getElementById('cnt-led-cycles').innerText = this.metrics.ledCycles.toLocaleString();
    document.getElementById('cnt-led-time').innerText = this.formatTime(this.metrics.ledTimeSec);
    const lBadge = document.getElementById('health-badge-led');
    lBadge.innerText = lCat.tag;
    lBadge.className = `health-badge ${lCat.css}`;
    document.getElementById('bar-health-led').style.width = `${lHealth}%`;

    // DHT
    const dHealth = this.calculateHealth(this.metrics.dhtCycles, this.limits.dht);
    const dCat = this.getHealthCategory(dHealth);
    document.getElementById('cnt-dht-cycles').innerText = this.metrics.dhtCycles.toLocaleString();
    document.getElementById('cnt-dht-time').innerText = this.formatTime(this.metrics.dhtTimeSec);
    const dBadge = document.getElementById('health-badge-dht');
    dBadge.innerText = dCat.tag;
    dBadge.className = `health-badge ${dCat.css}`;
    document.getElementById('bar-health-dht').style.width = `${dHealth}%`;
  }

  resetMetrics() {
    this.metrics = {
      relayCycles: 0, relayTimeSec: 0,
      servoCycles: 0, servoTimeSec: 0,
      ledCycles: 0, ledTimeSec: 0,
      dhtCycles: 0, dhtTimeSec: 0
    };
    this.updateHealthUI();
  }
}

// ==========================================================================
// 4. LATENCY CANVAS GRAPH RENDERER
// ==========================================================================
class LatencyChartRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.dataPoints = [];
    this.maxPoints = 20;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width - 28;
    this.canvas.height = 150;
    this.render();
  }

  addPoint(rttMs) {
    this.dataPoints.push(rttMs);
    if (this.dataPoints.length > this.maxPoints) {
      this.dataPoints.shift();
    }
    this.render();
  }

  clear() {
    this.dataPoints = [];
    this.render();
  }

  render() {
    const { width, height } = this.canvas;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, width, height);

    // Dibujar Rejilla de Fondo
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;

    for (let y = 30; y < height; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    if (this.dataPoints.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '12px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.fillText('Presiona "Iniciar Stress Test" para medir latencia RTT', width / 2, height / 2);
      return;
    }

    // Dibujar Línea de Gráfica RTT
    const maxVal = Math.max(...this.dataPoints, 60);
    const minVal = 0;
    const stepX = width / (this.maxPoints - 1);

    ctx.beginPath();
    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 2.5;

    this.dataPoints.forEach((val, index) => {
      const x = index * stepX;
      const y = height - ((val - minVal) / (maxVal - minVal)) * (height - 20) - 10;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Relleno con Gradiente debajo de la curva
    const lastX = (this.dataPoints.length - 1) * stepX;
    const firstX = 0;
    ctx.lineTo(lastX, height);
    ctx.lineTo(firstX, height);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(0, 242, 254, 0.25)');
    gradient.addColorStop(1, 'rgba(0, 242, 254, 0.0)');
    ctx.fillStyle = gradient;
    ctx.fill();

    // Dibujar puntos
    this.dataPoints.forEach((val, index) => {
      const x = index * stepX;
      const y = height - ((val - minVal) / (maxVal - minVal)) * (height - 20) - 10;
      
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#00e676';
      ctx.fill();
      ctx.strokeStyle = '#0b0e14';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }
}

// ==========================================================================
// 5. MAIN WORKBENCH APPLICATION CONTROLLER
// ==========================================================================
class WorkbenchApp {
  constructor() {
    this.serial = new SerialManager();
    this.mock = new MockHardwareEngine();
    this.telemetry = new TelemetryManager();
    this.chart = null;

    this.isMockMode = false;
    this.ledState = 0;
    this.autoPollTimers = {};
    this.commandHistory = [];
    this.historyIndex = -1;
    this.pendingPings = {};

    this.init();
  }

  init() {
    // 1. Verificar soporte de Web Serial API
    if (!this.serial.isSupported()) {
      document.getElementById('browser-warning').classList.remove('hidden');
      document.getElementById('api-support-tag').innerText = "Web Serial NO Soportado";
      document.getElementById('api-support-tag').className = "text-danger";
      this.setMode('mock');
    }

    // 2. Configurar Callbacks de Serial y Mock
    const handleLineReceived = (line) => this.onSerialLineReceived(line);
    const handleStatusChange = (connected, text) => this.onConnectionStatusChange(connected, text);
    const handleBytesReceived = (bytes) => {
      document.getElementById('rx-bytes-count').innerText = `${bytes.toLocaleString()} bytes`;
    };

    this.serial.onLineReceived = handleLineReceived;
    this.serial.onStatusChange = handleStatusChange;
    this.serial.onBytesReceived = handleBytesReceived;

    this.mock.onLineReceived = handleLineReceived;
    this.mock.onStatusChange = handleStatusChange;

    // 3. Event Listeners de la Interfaz
    document.getElementById('btn-connect').addEventListener('click', () => this.toggleConnection());
    document.getElementById('mode-select').addEventListener('change', (e) => this.setMode(e.target.value));
    
    // Tab Navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });

    // Enter Key on Custom Command Input
    document.getElementById('cmd-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.sendCustomCommand();
      } else if (e.key === 'ArrowUp') {
        this.navigateHistory(-1);
      } else if (e.key === 'ArrowDown') {
        this.navigateHistory(1);
      }
    });

    // Chart Renderer Setup
    this.chart = new LatencyChartRenderer('latencyCanvas');

    this.logConsole('SYSTEM', 'Testing Workbench inicializado correctamente.', 'sys');
  }

  setMode(mode) {
    if (mode === 'mock') {
      this.isMockMode = true;
      document.getElementById('mode-select').value = 'mock';
      this.logConsole('SYSTEM', 'Modo cambiado a: Simulador Virtual (Mock Hardware)', 'sys');
      if (this.serial.isConnected) {
        this.serial.disconnect();
      }
      this.mock.start();
    } else {
      this.isMockMode = false;
      document.getElementById('mode-select').value = 'usb';
      this.mock.stop();
      this.logConsole('SYSTEM', 'Modo cambiado a: Puerto USB Real (Web Serial API)', 'sys');
    }
  }

  async toggleConnection() {
    if (this.isMockMode) {
      if (this.mock.isSimulated) {
        this.mock.stop();
      } else {
        this.mock.start();
      }
      return;
    }

    if (this.serial.isConnected) {
      await this.serial.disconnect();
    } else {
      const baud = document.getElementById('baud-select').value;
      try {
        await this.serial.connect(baud);
      } catch (err) {
        this.logConsole('ERROR', err.message, 'err');
      }
    }
  }

  onConnectionStatusChange(connected, text) {
    const badge = document.getElementById('connection-status');
    const btnText = document.getElementById('btn-connect-text');
    const statusText = document.getElementById('status-text');
    const btn = document.getElementById('btn-connect');

    statusText.innerText = text;

    if (connected) {
      btn.classList.add('connected');
      btnText.innerText = "Desconectar";
      if (this.isMockMode) {
        badge.className = 'status-badge simulated';
      } else {
        badge.className = 'status-badge connected';
      }
    } else {
      btn.classList.remove('connected');
      btnText.innerText = "Conectar Puerto";
      badge.className = 'status-badge disconnected';
    }
  }

  async sendCommand(command) {
    document.getElementById('active-frame-tag').innerText = command;
    this.logConsole('TX', command, 'tx');

    if (this.isMockMode) {
      this.mock.send(command);
    } else {
      if (!this.serial.isConnected) {
        this.logConsole('ERROR', 'No hay dispositivo serial conectado.', 'err');
        return;
      }
      const lineEnding = document.getElementById('line-ending-select').value;
      await this.serial.send(command + lineEnding);
    }
  }

  onSerialLineReceived(line) {
    const mode = document.getElementById('console-view-mode').value;
    let displayLine = line;

    if (mode === 'hex') {
      displayLine = Array.from(new TextEncoder().encode(line))
        .map(b => b.toString(16).padStart(2, '0').toUpperCase())
        .join(' ');
    }

    this.logConsole('RX', displayLine, 'rx');

    // Procesar PING / PONG para cálculo de latencia
    if (line.startsWith('PONG:')) {
      const pingId = line.split(':')[1];
      if (this.pendingPings[pingId]) {
        const startTime = this.pendingPings[pingId];
        const rtt = Math.round(performance.now() - startTime);
        delete this.pendingPings[pingId];
        
        if (this.onPongReceived) {
          this.onPongReceived(pingId, rtt);
        }
      }
    }

    // Decodificador Universal de Protocolos (JSON, CSV, Key-Value)
    this.parseUniversalProtocol(line);
  }

  parseUniversalProtocol(line) {
    const protocolMode = document.getElementById('protocol-select') ? document.getElementById('protocol-select').value : 'json';

    try {
      // 1. JSON Format
      if (line.startsWith('{') || protocolMode === 'json') {
        if (line.startsWith('{')) {
          const json = JSON.parse(line);
          this.handleJsonData(json);
          return;
        }
      }

      // 2. CSV Format (ej: "24.5,58.0,42.8,680" -> Temp, Hum, Dist, LDR)
      if (protocolMode === 'csv' || (line.includes(',') && !line.startsWith('ACK:'))) {
        const parts = line.split(',').map(p => parseFloat(p.trim()));
        if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          this.handleJsonData({ sensor: "DHT22", temp: parts[0], hum: parts[1] });
        }
        if (parts.length >= 3 && !isNaN(parts[2])) {
          this.handleJsonData({ sensor: "HCSR04", dist_cm: parts[2] });
        }
        if (parts.length >= 4 && !isNaN(parts[3])) {
          const raw = Math.round(parts[3]);
          const pct = parseFloat(((raw / 1023) * 100).toFixed(1));
          this.handleJsonData({ sensor: "LDR", raw: raw, percent: pct });
        }
        return;
      }

      // 3. Key-Value Format (ej: "TEMP=24.5;HUM=58.0" o "T:24.5,H:58")
      if (protocolMode === 'keyvalue' || line.includes('=')) {
        const kvMap = {};
        const pairs = line.split(/[;,]/);
        pairs.forEach(p => {
          const [k, v] = p.split('=').map(s => s.trim());
          if (k && v) kvMap[k.toUpperCase()] = parseFloat(v);
        });

        if (kvMap['TEMP'] !== undefined || kvMap['T'] !== undefined) {
          const t = kvMap['TEMP'] !== undefined ? kvMap['TEMP'] : kvMap['T'];
          const h = kvMap['HUM'] !== undefined ? kvMap['HUM'] : (kvMap['H'] || 50.0);
          this.handleJsonData({ sensor: "DHT22", temp: t, hum: h });
        }
        if (kvMap['DIST'] !== undefined || kvMap['D'] !== undefined) {
          const d = kvMap['DIST'] !== undefined ? kvMap['DIST'] : kvMap['D'];
          this.handleJsonData({ sensor: "HCSR04", dist_cm: d });
        }
        if (kvMap['LDR'] !== undefined || kvMap['L'] !== undefined) {
          const l = kvMap['LDR'] !== undefined ? kvMap['LDR'] : kvMap['L'];
          const pct = parseFloat(((l / 1023) * 100).toFixed(1));
          this.handleJsonData({ sensor: "LDR", raw: l, percent: pct });
        }
      }
    } catch (e) {
      // Continuar si es trama en texto plano
    }
  }

  handleJsonData(json) {
    if (json.sensor === "DHT22" || json.sensor === "DHT11") {
      document.getElementById('dht-temp-val').innerHTML = `${json.temp} <span class="unit">°C</span>`;
      document.getElementById('dht-hum-val').innerHTML = `${json.hum} <span class="unit">%</span>`;
      document.getElementById('dht-temp-bar').style.width = `${Math.min(100, (json.temp / 50) * 100)}%`;
      document.getElementById('dht-hum-bar').style.width = `${json.hum}%`;
      this.telemetry.recordUsage('dht');
    } else if (json.sensor === "HCSR04") {
      document.getElementById('dist-val').innerText = json.dist_cm;
      const barPct = Math.min(100, (json.dist_cm / 100) * 100);
      document.getElementById('dist-bar-fill').style.width = `${barPct}%`;
      
      const statusEl = document.getElementById('dist-status');
      if (json.dist_cm < 10) {
        statusEl.innerText = "🔴 PELIGRO: Obstáculo (<10cm)";
        statusEl.style.color = "var(--color-red)";
      } else if (json.dist_cm < 20) {
        statusEl.innerText = "🟡 Precaución (10-20cm)";
        statusEl.style.color = "var(--color-yellow)";
      } else {
        statusEl.innerText = "🟢 Zona Segura (>20cm)";
        statusEl.style.color = "var(--color-green)";
      }
    } else if (json.sensor === "LDR") {
      document.getElementById('ldr-raw-val').innerText = `RAW: ${json.raw} / 1023`;
      document.getElementById('ldr-percent-val').innerHTML = `${json.percent} <span class="unit">% LUX</span>`;
      document.getElementById('ldr-bar-fill').style.width = `${json.percent}%`;
    }
  }

  // ==========================================================================
  // CONTROLES DE COMPONENTES (INYECCIÓN DE COMANDOS)
  // ==========================================================================

  toggleLed() {
    this.ledState = this.ledState === 0 ? 1 : 0;
    const cmd = `SET:LED:${this.ledState}`;
    document.getElementById('led-cmd-code').innerText = cmd;
    
    const ledInd = document.getElementById('led-indicator');
    if (this.ledState === 1) ledInd.classList.add('on');
    else ledInd.classList.remove('on');

    this.telemetry.recordUsage('led');
    this.sendCommand(cmd);
  }

  blinkLed() {
    const cmd = `SET:LEDBLINK:500`;
    document.getElementById('led-cmd-code').innerText = cmd;
    this.telemetry.recordUsage('led', 5);
    this.sendCommand(cmd);
  }

  updateLedPwm(val) {
    document.getElementById('led-pwm-val').innerText = val;
    const cmd = `SET:LEDPWM:${val}`;
    document.getElementById('led-cmd-code').innerText = cmd;
    this.sendCommand(cmd);
  }

  testBuzzer() {
    const freq = document.getElementById('buzzer-freq').value;
    const dur = document.getElementById('buzzer-dur').value;
    const cmd = `SET:BUZZER:${freq}:${dur}`;
    document.getElementById('buzzer-cmd-code').innerText = cmd;
    
    const status = document.getElementById('buzzer-status');
    status.innerText = "EMITIENDO TONO";
    status.style.color = "var(--color-yellow)";
    setTimeout(() => {
      status.innerText = "Inactivo";
      status.style.color = "var(--text-muted)";
    }, parseInt(dur, 10));

    this.sendCommand(cmd);
  }

  presetBuzzer(type) {
    if (type === 'alarm') {
      document.getElementById('buzzer-freq').value = 2500;
      document.getElementById('buzzer-freq-val').innerText = '2500 Hz';
      document.getElementById('buzzer-dur').value = 800;
      document.getElementById('buzzer-dur-val').innerText = '800 ms';
    } else if (type === 'chime') {
      document.getElementById('buzzer-freq').value = 1800;
      document.getElementById('buzzer-freq-val').innerText = '1800 Hz';
      document.getElementById('buzzer-dur').value = 250;
      document.getElementById('buzzer-dur-val').innerText = '250 ms';
    }
    this.testBuzzer();
  }

  toggleRelay(channel, enabled) {
    const val = enabled ? 1 : 0;
    const cmd = `SET:RELAY:${channel}:${val}`;
    document.getElementById('relay-cmd-code').innerText = cmd;
    
    const badge = document.getElementById('relay-state-badge');
    const ch1 = document.getElementById('relay-ch1-toggle').checked;
    const ch2 = document.getElementById('relay-ch2-toggle').checked;

    if (ch1 || ch2) {
      badge.innerText = "CERRADO (ON)";
      badge.classList.add('active');
    } else {
      badge.innerText = "ABIERTO (OFF)";
      badge.classList.remove('active');
    }

    this.telemetry.recordUsage('relay');
    this.sendCommand(cmd);
  }

  pulseRelay(channel) {
    document.getElementById('relay-ch1-toggle').checked = true;
    this.toggleRelay(channel, true);
    setTimeout(() => {
      document.getElementById('relay-ch1-toggle').checked = false;
      this.toggleRelay(channel, false);
    }, 500);
  }

  readDht() {
    this.sendCommand('GET:DHT');
  }

  readDistance() {
    this.sendCommand('GET:DIST');
  }

  readLdr() {
    this.sendCommand('GET:LDR');
  }

  toggleAutoPoll(sensor, enabled) {
    if (enabled) {
      this.autoPollTimers[sensor] = setInterval(() => {
        if (sensor === 'dht') this.readDht();
      }, 3000);
      this.logConsole('SYSTEM', `Auto-poll activado para sensor ${sensor.toUpperCase()}`, 'sys');
    } else {
      clearInterval(this.autoPollTimers[sensor]);
      delete this.autoPollTimers[sensor];
      this.logConsole('SYSTEM', `Auto-poll desactivado para sensor ${sensor.toUpperCase()}`, 'sys');
    }
  }

  updateServoAngle(angle) {
    document.getElementById('servo-slider-val').innerText = `${angle}°`;
    document.getElementById('servo-angle-display').innerText = `${angle}°`;
    document.getElementById('servo-arm').style.transform = `rotate(${angle - 90}deg)`;
    const cmd = `SET:SERVO:${angle}`;
    document.getElementById('servo-cmd-code').innerText = cmd;
    this.telemetry.recordUsage('servo');
    this.sendCommand(cmd);
  }

  setServoPreset(angle) {
    document.getElementById('servo-slider').value = angle;
    this.updateServoAngle(angle);
  }

  sweepServo() {
    let angle = 0;
    let direction = 1;
    const interval = setInterval(() => {
      angle += direction * 30;
      if (angle >= 180) direction = -1;
      if (angle <= 0) {
        clearInterval(interval);
        angle = 90;
      }
      this.setServoPreset(angle);
    }, 200);
  }

  updateDcMotorSpeed(speed) {
    document.getElementById('motor-speed-val').innerText = `${speed}%`;
    document.getElementById('motor-speed-text').innerText = `Velocidad: ${speed}%`;
  }

  setDcMotor(dir) {
    const speed = document.getElementById('motor-speed-slider').value;
    const gear = document.getElementById('motor-gear');
    const pill = document.getElementById('dcmotor-status-pill');
    
    document.getElementById('motor-dir-text').innerText = `Sentido: ${dir}`;

    if (dir === 'CW') {
      gear.className = 'spinning-gear spinning-cw';
      pill.innerText = "GIRANDO (CW)";
      pill.style.color = "var(--color-green)";
    } else {
      gear.className = 'spinning-gear spinning-ccw';
      pill.innerText = "GIRANDO (CCW)";
      pill.style.color = "var(--color-cyan)";
    }

    const cmd = `SET:DCMOTOR:${speed}:${dir}`;
    document.getElementById('dcmotor-cmd-code').innerText = cmd;
    this.sendCommand(cmd);
  }

  stopDcMotor() {
    const gear = document.getElementById('motor-gear');
    gear.className = 'spinning-gear';
    const pill = document.getElementById('dcmotor-status-pill');
    pill.innerText = "DETENIDO";
    pill.style.color = "var(--text-muted)";
    document.getElementById('motor-dir-text').innerText = `Sentido: --`;

    const cmd = `SET:DCMOTOR:0:STOP`;
    document.getElementById('dcmotor-cmd-code').innerText = cmd;
    this.sendCommand(cmd);
  }

  // ==========================================================================
  // STRESS TEST & DIAGNOSTICS MODULE
  // ==========================================================================

  async runStressTest() {
    const btn = document.getElementById('btn-stress-test');
    btn.disabled = true;
    btn.innerText = "⏳ Ejecutando Test...";

    const progressBar = document.getElementById('stress-bar');
    const badge = document.getElementById('rtt-latest-badge');
    const rtts = [];

    this.chart.clear();
    this.logConsole('SYSTEM', '=== INICIANDO TEST DE ESTRÉS HARDWARE (10 CICLOS) ===', 'sys');

    for (let i = 1; i <= 10; i++) {
      const pingId = i.toString();
      progressBar.style.width = `${(i / 10) * 100}%`;
      
      const startTime = performance.now();
      this.pendingPings[pingId] = startTime;

      await this.sendCommand(`PING:${pingId}`);

      // Esperar respuesta PONG con timeout de 500ms
      const rtt = await new Promise((resolve) => {
        this.onPongReceived = (id, calculatedRtt) => {
          if (id === pingId) resolve(calculatedRtt);
        };
        setTimeout(() => resolve(null), 500);
      });

      if (rtt !== null) {
        rtts.push(rtt);
        this.chart.addPoint(rtt);
        badge.innerText = `Ciclo ${i}: ${rtt} ms`;
      } else {
        this.logConsole('ERROR', `Timeout en Ciclo ${i}`, 'err');
      }

      await new Promise(r => setTimeout(r, 120)); // Pausa entre paquetes
    }

    // Calcular estadísticas
    if (rtts.length > 0) {
      const minRtt = Math.min(...rtts);
      const maxRtt = Math.max(...rtts);
      const avgRtt = Math.round(rtts.reduce((a, b) => a + b, 0) / rtts.length);
      const lossPct = Math.round(((10 - rtts.length) / 10) * 100);

      document.getElementById('metric-min-rtt').innerText = `${minRtt} ms`;
      document.getElementById('metric-avg-rtt').innerText = `${avgRtt} ms`;
      document.getElementById('metric-max-rtt').innerText = `${maxRtt} ms`;
      document.getElementById('metric-loss').innerText = `${lossPct}%`;

      this.logConsole('SYSTEM', `=== FIN TEST: Avg ${avgRtt}ms | Min ${minRtt}ms | Max ${maxRtt}ms | Loss ${lossPct}% ===`, 'sys');
    }

    btn.disabled = false;
    btn.innerText = "🚀 Iniciar Stress Test (10 Ciclos)";
  }

  resetHealthMetrics() {
    this.telemetry.resetMetrics();
    this.logConsole('SYSTEM', 'Métricas de desgaste de componentes reseteadas.', 'sys');
  }

  // ==========================================================================
  // TERMINAL & CONSOLE MONITOR LOGIC
  // ==========================================================================

  logConsole(tag, text, type) {
    if (document.getElementById('chk-pause').checked) return;

    const logBox = document.getElementById('console-log');
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;

    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;

    entry.innerHTML = `<span class="timestamp">[${timestamp}]</span> <strong>[${tag}]</strong> ${this.escapeHtml(text)}`;
    logBox.appendChild(entry);

    if (document.getElementById('chk-autoscroll').checked) {
      logBox.scrollTop = logBox.scrollHeight;
    }
  }

  clearConsole() {
    document.getElementById('console-log').innerHTML = '';
  }

  exportConsoleLog() {
    const entries = Array.from(document.querySelectorAll('.log-entry')).map(e => e.innerText);
    const blob = new Blob([entries.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hardware_workbench_log_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  sendCustomCommand() {
    const input = document.getElementById('cmd-input');
    const val = input.value.trim();
    if (!val) return;

    this.commandHistory.push(val);
    this.historyIndex = this.commandHistory.length;

    this.sendCommand(val);
    input.value = '';
  }

  navigateHistory(direction) {
    if (this.commandHistory.length === 0) return;
    this.historyIndex += direction;
    if (this.historyIndex < 0) this.historyIndex = 0;
    if (this.historyIndex >= this.commandHistory.length) {
      this.historyIndex = this.commandHistory.length;
      document.getElementById('cmd-input').value = '';
      return;
    }
    document.getElementById('cmd-input').value = this.commandHistory[this.historyIndex];
  }

  switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      if (btn.dataset.tab === tabId) btn.classList.add('active');
      else btn.classList.remove('active');
    });

    document.querySelectorAll('.tab-pane').forEach(pane => {
      if (pane.id === `tab-${tabId}`) pane.classList.add('active');
      else pane.classList.remove('active');
    });

    if (tabId === 'firmware') {
      this.loadFirmwareCodeDisplay();
    }
  }

  // ==========================================================================
  // ACADEMIC FEATURES: GUIDED DEMO & EVALUATION REPORT
  // ==========================================================================

  onMcuChange(mcuKey) {
    this.logConsole('SYSTEM', `Tarjeta seleccionada: ${mcuKey.toUpperCase()}`, 'sys');
  }

  async startGuidedDemo() {
    this.setMode('mock');
    const toast = document.getElementById('demo-toast-banner');
    const titleEl = document.getElementById('demo-step-title');
    const descEl = document.getElementById('demo-step-desc');
    
    toast.classList.remove('hidden');
    this.isGuidedDemoRunning = true;

    // Paso 1: Actuadores
    titleEl.innerText = "🎓 Demostración Exposición: Paso 1/5 - Actuadores";
    descEl.innerText = "Probando encendido LED, brillo PWM y tono de Buzzer...";
    this.switchTab('actuators');
    await new Promise(r => setTimeout(r, 1000));
    this.toggleLed();
    await new Promise(r => setTimeout(r, 1200));
    this.updateLedPwm(200);
    await new Promise(r => setTimeout(r, 1200));
    this.presetBuzzer('chime');
    await new Promise(r => setTimeout(r, 1500));

    if (!this.isGuidedDemoRunning) return;

    // Paso 2: Sensores
    titleEl.innerText = "🎓 Demostración Exposición: Paso 2/5 - Sensores";
    descEl.innerText = "Adquiriendo datos de Temperatura (DHT), Distancia (HC-SR04) y Luz (LDR)...";
    this.switchTab('sensors');
    await new Promise(r => setTimeout(r, 800));
    this.readDht();
    await new Promise(r => setTimeout(r, 1200));
    this.readDistance();
    await new Promise(r => setTimeout(r, 1200));
    this.readLdr();
    await new Promise(r => setTimeout(r, 1500));

    if (!this.isGuidedDemoRunning) return;

    // Paso 3: Motores
    titleEl.innerText = "🎓 Demostración Exposición: Paso 3/5 - Control de Motores";
    descEl.innerText = "Ejecutando barrido de Servomotor y giro de Motor DC...";
    this.switchTab('motors');
    await new Promise(r => setTimeout(r, 800));
    this.sweepServo();
    await new Promise(r => setTimeout(r, 1800));
    this.setDcMotor('CW');
    await new Promise(r => setTimeout(r, 1500));
    this.stopDcMotor();
    await new Promise(r => setTimeout(r, 1200));

    if (!this.isGuidedDemoRunning) return;

    // Paso 4: Diagnóstico y Stress Test
    titleEl.innerText = "🎓 Demostración Exposición: Paso 4/5 - Test de Estrés RTT";
    descEl.innerText = "Evaluando latencia de canal serial y desgaste estimado de componentes...";
    this.switchTab('diagnostics');
    await new Promise(r => setTimeout(r, 1000));
    await this.runStressTest();

    if (!this.isGuidedDemoRunning) return;

    // Paso 5: Generación del Reporte PDF
    titleEl.innerText = "🎓 Demostración Exposición: Paso 5/5 - Evaluación Académica";
    descEl.innerText = "Generando Reporte de Laboratorio e Inspección para el Profesor...";
    await new Promise(r => setTimeout(r, 1000));
    toast.classList.add('hidden');
    this.openAcademicReportModal();
  }

  stopGuidedDemo() {
    this.isGuidedDemoRunning = false;
    document.getElementById('demo-toast-banner').classList.add('hidden');
    this.logConsole('SYSTEM', 'Demostración guiada detenida por el usuario.', 'sys');
  }

  openAcademicReportModal() {
    // Actualizar datos del modal en tiempo real
    document.getElementById('rep-relay-cycles').innerText = this.telemetry.metrics.relayCycles;
    document.getElementById('rep-relay-time').innerText = this.telemetry.formatTime(this.telemetry.metrics.relayTimeSec);
    document.getElementById('rep-servo-cycles').innerText = this.telemetry.metrics.servoCycles;
    document.getElementById('rep-servo-time').innerText = this.telemetry.formatTime(this.telemetry.metrics.servoTimeSec);
    document.getElementById('rep-led-cycles').innerText = this.telemetry.metrics.ledCycles;
    document.getElementById('rep-led-time').innerText = this.telemetry.formatTime(this.telemetry.metrics.ledTimeSec);
    document.getElementById('rep-dht-cycles').innerText = this.telemetry.metrics.dhtCycles;
    document.getElementById('rep-dht-time').innerText = this.telemetry.formatTime(this.telemetry.metrics.dhtTimeSec);

    const avgRttText = document.getElementById('metric-avg-rtt').innerText;
    document.getElementById('rep-rtt-avg').innerText = avgRttText !== '-- ms' ? avgRttText : '18 ms (Simulado)';

    document.getElementById('academic-report-modal').classList.remove('hidden');
  }

  closeAcademicReportModal() {
    document.getElementById('academic-report-modal').classList.add('hidden');
  }

  switchFirmwareLang(lang) {
    document.querySelectorAll('.firmware-lang-btn').forEach(btn => btn.classList.remove('active'));
    if (lang === 'cpp') {
      event.currentTarget.classList.add('active');
      this.currentFirmwareLang = 'cpp';
    } else {
      event.currentTarget.classList.add('active');
      this.currentFirmwareLang = 'python';
    }
    this.loadFirmwareCodeDisplay();
  }

  loadFirmwareCodeDisplay() {
    const codeDisplay = document.getElementById('firmware-code-display');
    if (!this.currentFirmwareLang || this.currentFirmwareLang === 'cpp') {
      codeDisplay.innerText = `// HARDWARE WORKBENCH - ARDUINO C++ FIRMWARE
#include <Arduino.h>
#include <Servo.h>

#define PIN_LED 13
#define PIN_BUZZER 8
#define PIN_RELAY1 7
#define PIN_SERVO 9

Servo myservo;

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_RELAY1, OUTPUT);
  myservo.attach(PIN_SERVO);
  Serial.println("[SYSTEM] C++ Workbench Firmware Active.");
}

void loop() {
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\\n');
    cmd.trim();
    if (cmd == "SET:LED:1") { digitalWrite(PIN_LED, HIGH); Serial.println("ACK:LED:1"); }
    else if (cmd == "SET:LED:0") { digitalWrite(PIN_LED, LOW); Serial.println("ACK:LED:0"); }
    else if (cmd == "GET:DHT") { Serial.println("{\\"status\\":\\"OK\\",\\"sensor\\":\\"DHT22\\",\\"temp\\":24.5,\\"hum\\":58.0}"); }
    else if (cmd.startsWith("PING:")) { Serial.println("PONG:" + cmd.substring(5)); }
  }
}`;
    } else {
      codeDisplay.innerText = `""
HARDWARE WORKBENCH - UNIVERSAL MICROPYTHON FIRMWARE
Raspberry Pi Pico / ESP32
""
import sys, select, time, json
from machine import Pin, PWM, ADC

PIN_LED = Pin(25, Pin.OUT)
pwm_led = PWM(PIN_LED)
pwm_led.freq(1000)

print("[SYSTEM] MicroPython Hardware Workbench Active.")

poll_obj = select.poll()
poll_obj.register(sys.stdin, select.POLLIN)

while True:
    if poll_obj.poll(10):
        cmd = sys.stdin.readline().strip()
        if cmd == "SET:LED:1":
            pwm_led.duty_u16(65535)
            print("ACK:LED:1")
        elif cmd == "SET:LED:0":
            pwm_led.duty_u16(0)
            print("ACK:LED:0")
        elif cmd == "GET:DHT":
            print(json.dumps({"status": "OK", "sensor": "DHT22", "temp": 24.5, "hum": 58.0}))
        elif cmd.startswith("PING:"):
            print(f"PONG:{cmd.split(':')[1]}")`;
    }
  }

  copyFirmwareCode() {
    const code = document.getElementById('firmware-code-display').innerText;
    navigator.clipboard.writeText(code).then(() => {
      alert("¡Código de Firmware copiado al portapapeles con éxito!");
    });
  }

  escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}

// Inicializar Aplicación al Cargar DOM
document.addEventListener('DOMContentLoaded', () => {
  window.WorkbenchApp = new WorkbenchApp();
});
