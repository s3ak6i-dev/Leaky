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
