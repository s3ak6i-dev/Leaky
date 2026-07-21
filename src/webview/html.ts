/**
 * Static webview shell (UISpec §4). Carries no data — the extension host
 * pushes SessionStats-derived snapshots via postMessage({type:'update'})
 * after the webview signals it's ready, and the webview re-renders
 * statelessly from each snapshot (TRD §5).
 */
export function getWebviewHtml(nonce: string, cspSource: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
<title>Leaky — Session Burn-down</title>
<style>
  body {
    font-family: var(--vscode-editor-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 16px;
  }
  .source-line {
    font-size: 12px;
    opacity: 0.7;
    margin-bottom: 16px;
    word-break: break-all;
  }
  .headline {
    display: flex;
    flex-wrap: wrap;
    gap: 24px;
    margin-bottom: 20px;
  }
  .stat { min-width: 120px; }
  .stat .big { font-size: 26px; font-weight: 700; }
  .stat .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.7; }
  .banner {
    padding: 8px 12px;
    margin-bottom: 16px;
    border-radius: 4px;
    background: var(--vscode-inputValidation-warningBackground, #66551a);
    border: 1px solid var(--vscode-inputValidation-warningBorder, #b89500);
    font-size: 12px;
    display: none;
  }
  .banner.visible { display: block; }
  .empty-state { opacity: 0.6; font-size: 12px; padding: 24px 0; }
  #chart-container { overflow-x: auto; }
  #chart { display: block; }
  .legend { display: flex; gap: 16px; margin-top: 8px; font-size: 11px; }
  .legend .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; }

  .leaks-section { margin-top: 28px; }
  .leaks-header {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.7;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  .leaks-count-badge {
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border-radius: 10px;
    padding: 0 6px;
    font-size: 10px;
  }
  .leaks-empty { opacity: 0.6; font-size: 12px; }
  .finding-card {
    border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.3));
    border-radius: 4px;
    padding: 10px 12px;
    margin-bottom: 8px;
  }
  .finding-card-top { display: flex; align-items: center; gap: 8px; }
  .severity-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .severity-dot.info { background: var(--vscode-descriptionForeground, #888); }
  .severity-dot.warn { border: 2px solid #E0A336; background: transparent; }
  .severity-dot.high { background: #E0A336; }
  .finding-title { font-weight: 600; font-size: 13px; flex: 1; }
  .confidence-badge {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    opacity: 0.7;
    border: 1px solid currentColor;
    border-radius: 3px;
    padding: 1px 5px;
  }
  .dismiss-btn {
    background: none;
    border: none;
    color: var(--vscode-foreground);
    opacity: 0.6;
    cursor: pointer;
    font-size: 14px;
    padding: 0 2px;
  }
  .dismiss-btn:hover { opacity: 1; }
  .finding-detail { font-size: 12px; opacity: 0.85; margin-top: 4px; }
  .finding-recommendation { font-size: 12px; color: #E0A336; margin-top: 4px; }
</style>
</head>
<body>
  <div id="banner-degraded" class="banner"></div>
  <div class="source-line" id="source-line"></div>
  <div class="headline" id="headline"></div>
  <div id="chart-container">
    <canvas id="chart" width="100" height="180"></canvas>
    <div class="legend">
      <span><span class="swatch" style="background:#4FB3A9"></span>fresh input</span>
      <span><span class="swatch" style="background:#7C9CD6"></span>cache write</span>
      <span><span class="swatch" style="background:#E0A336"></span>cache read (resent)</span>
      <span><span class="swatch" style="background:#D97757"></span>output</span>
    </div>
  </div>
  <div id="empty-state" class="empty-state" style="display:none;">Waiting on session activity…</div>

  <div class="leaks-section">
    <div class="leaks-header">
      <span>LEAKS</span>
      <span class="leaks-count-badge" id="leaks-count">0</span>
    </div>
    <div id="leaks-list"></div>
  </div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const COLORS = { fresh: "#4FB3A9", cacheWrite: "#7C9CD6", cacheRead: "#E0A336", output: "#D97757" };

  function formatTokens(n) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(0) + "k";
    return String(n);
  }

  function renderHeadline(data) {
    const el = document.getElementById("headline");
    el.innerHTML = "";
    const stats = [
      { big: data.costLabel, label: "session cost" },
      { big: formatTokens(data.totals.total), label: "total tokens" },
      { big: data.resentPct + "%", label: "resent context" },
      { big: data.turnCount + " turns · " + data.durationLabel, label: "turns · duration" },
    ];
    for (const s of stats) {
      const div = document.createElement("div");
      div.className = "stat";
      div.innerHTML = '<div class="big">' + s.big + '</div><div class="label">' + s.label + '</div>';
      el.appendChild(div);
    }
  }

  function renderChart(bars) {
    const canvas = document.getElementById("chart");
    const container = document.getElementById("chart-container");
    const emptyState = document.getElementById("empty-state");

    if (!bars.length) {
      canvas.style.display = "none";
      emptyState.style.display = "block";
      return;
    }
    canvas.style.display = "block";
    emptyState.style.display = "none";

    const barWidth = 6;
    const gap = 2;
    const height = 180;
    const width = bars.length * (barWidth + gap);
    canvas.width = Math.max(width, container.clientWidth || 100);
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const maxTotal = Math.max(...bars.map((b) => b.totalTokens), 1);

    bars.forEach((bar, i) => {
      const x = i * (barWidth + gap);
      let y = height;
      const segments = [
        [bar.fresh, COLORS.fresh],
        [bar.cacheWrite, COLORS.cacheWrite],
        [bar.cacheRead, COLORS.cacheRead],
        [bar.output, COLORS.output],
      ];
      for (const [value, color] of segments) {
        const segHeight = (value / maxTotal) * (height - 4);
        y -= segHeight;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, barWidth, segHeight);
      }
    });
  }

  // Dismiss is per-session and in-memory only (UISpec §6): a dismissed
  // finding stays hidden across re-renders driven by live poll updates,
  // but resets if the panel is closed and reopened (persistence is v0.3).
  const dismissedIds = new Set();

  function renderFindings(findings) {
    const list = document.getElementById("leaks-list");
    const countBadge = document.getElementById("leaks-count");
    const visible = findings.filter((f) => !dismissedIds.has(f.id));

    countBadge.textContent = String(visible.length);
    list.innerHTML = "";

    if (visible.length === 0) {
      const empty = document.createElement("div");
      empty.className = "leaks-empty";
      empty.textContent = "No leaks detected yet — totals above are the whole story so far.";
      list.appendChild(empty);
      return;
    }

    for (const finding of visible) {
      const card = document.createElement("div");
      card.className = "finding-card";

      const top = document.createElement("div");
      top.className = "finding-card-top";

      const dot = document.createElement("span");
      dot.className = "severity-dot " + finding.severity;

      const title = document.createElement("span");
      title.className = "finding-title";
      title.textContent = finding.title;

      const confidence = document.createElement("span");
      confidence.className = "confidence-badge";
      confidence.textContent = finding.confidence;

      const dismissBtn = document.createElement("button");
      dismissBtn.className = "dismiss-btn";
      dismissBtn.textContent = "×";
      dismissBtn.addEventListener("click", () => {
        dismissedIds.add(finding.id);
        renderFindings(findings);
      });

      top.append(dot, title, confidence, dismissBtn);

      const detail = document.createElement("div");
      detail.className = "finding-detail";
      detail.textContent = finding.detail;

      const recommendation = document.createElement("div");
      recommendation.className = "finding-recommendation";
      recommendation.textContent = finding.recommendation;

      card.append(top, detail, recommendation);
      list.appendChild(card);
    }
  }

  function render(data) {
    document.getElementById("source-line").textContent = data.sessionPath;

    const banner = document.getElementById("banner-degraded");
    if (data.degraded) {
      banner.textContent =
        "Some of this session's log lines couldn't be parsed (" + data.skippedLines + " of " + data.totalLines + " skipped). Totals may undercount.";
      banner.classList.add("visible");
    } else {
      banner.classList.remove("visible");
    }

    renderHeadline(data);
    renderChart(data.bars);
    renderFindings(data.findings || []);
  }

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (message.type === "update") render(message);
  });

  vscode.postMessage({ type: "ready" });
</script>
</body>
</html>`;
}
