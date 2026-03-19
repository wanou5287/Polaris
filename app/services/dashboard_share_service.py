from __future__ import annotations

import asyncio
import json
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from app.services.notification_service import NotificationService
from app.services.oss_service import OSSService


EDGE_PATHS = [
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
    Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
]


def find_edge() -> Path:
    for candidate in EDGE_PATHS:
        if candidate.exists():
            return candidate
    raise FileNotFoundError("未找到 Microsoft Edge，可用它来导出图表截图。")


def build_share_html(
    *,
    widget_title: str,
    dataset_label: str,
    widget_type: str,
    target_date: str,
    dimensions: list[str],
    metrics: list[dict[str, Any]],
    rows: list[dict[str, Any]],
    series_field: str,
    series_groups: list[dict[str, str]],
) -> str:
    chart_payload = json.dumps(
        {
            "widgetType": widget_type,
            "dimensions": dimensions,
            "metrics": metrics,
            "rows": rows,
            "seriesField": series_field,
            "seriesGroups": series_groups,
            "title": widget_title,
            "subtitle": f"{dataset_label} | {target_date}",
        },
        ensure_ascii=False,
    )
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{widget_title}</title>
  <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
  <style>
    html, body {{
      margin: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(180deg, #f6f8fc 0%, #eef3ff 100%);
      font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
    }}
    .frame {{
      width: 1260px;
      height: 720px;
      margin: 0 auto;
      padding: 24px;
      box-sizing: border-box;
    }}
    .card {{
      height: 100%;
      background: rgba(255,255,255,.96);
      border: 1px solid rgba(15,23,42,.06);
      border-radius: 28px;
      box-shadow: 0 20px 72px rgba(31, 41, 55, 0.10);
      padding: 24px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
    }}
    .meta {{
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
      margin-bottom: 8px;
    }}
    .title {{
      font-size: 34px;
      line-height: 1.15;
      font-weight: 700;
      color: #0f172a;
    }}
    .subtitle {{
      font-size: 16px;
      color: #51607a;
    }}
    #chart {{
      flex: 1;
      min-height: 0;
    }}
  </style>
</head>
<body>
  <div class="frame">
    <div class="card">
      <div class="meta">
        <div class="title" id="title"></div>
        <div class="subtitle" id="subtitle"></div>
      </div>
      <div id="chart"></div>
    </div>
  </div>
  <script>
    const payload = {chart_payload};
    document.getElementById("title").textContent = payload.title;
    document.getElementById("subtitle").textContent = payload.subtitle;

    function formatChartLabel(value) {{
      const number = Number(value ?? 0);
      if (!Number.isFinite(number)) return "--";
      return number.toLocaleString("zh-CN", {{ maximumFractionDigits: 2 }});
    }}

    function chartSeriesLabel(widgetType) {{
      if (!["line", "bar", "stacked_bar", "stacked_hbar"].includes(widgetType)) return {{ show: false }};
      return {{
        show: true,
        position: widgetType === "line" ? "top" : (widgetType === "stacked_hbar" ? "insideRight" : (widgetType === "stacked_bar" ? "inside" : "top")),
        distance: 6,
        color: "#44506b",
        fontSize: 18,
        formatter: (params) => {{
          const value = Array.isArray(params.value) ? params.value[1] : params.value;
          const numeric = Number(value ?? 0);
          if (!Number.isFinite(numeric) || numeric === 0) return "";
          return formatChartLabel(numeric);
        }},
      }};
    }}

    const chart = echarts.init(document.getElementById("chart"), null, {{ renderer: "canvas" }});
    const dimensions = payload.dimensions || [];
    const metrics = payload.metrics || [];
    const rows = payload.rows || [];
    const dimension = dimensions[0];
    const categories = rows.map((row) => String(row[dimension] ?? ""));
    const palette = ["#5b6cff", "#65c18c", "#f0b429", "#6ec5e9", "#ec5f87"];
    const hasSeriesBreakdown = Boolean((payload.seriesField || "") && (payload.seriesGroups || []).length);
    const isHorizontal = payload.widgetType === "stacked_hbar";

    if (payload.widgetType === "pie") {{
      const metric = metrics[0];
      chart.setOption({{
        animation: false,
        color: palette,
        tooltip: {{ trigger: "item" }},
        legend: {{ bottom: 0, textStyle: {{ color: "#475467", fontSize: 18 }} }},
        series: [{{
          type: "pie",
          radius: ["34%", "70%"],
          itemStyle: {{ borderRadius: 12, borderColor: "#fff", borderWidth: 2 }},
          label: {{ fontSize: 18 }},
          data: rows.map((row) => ({{ name: String(row[dimension] ?? ""), value: Number(row[metric.alias] || 0) }})),
        }}],
      }});
    }} else {{
      const chartSeries = hasSeriesBreakdown
        ? (payload.seriesGroups || []).flatMap((group) => metrics.map((metric) => ({{
            name: metrics.length > 1 ? `${{group.label}} · ${{metric.label || metric.alias}}` : group.label,
            type: payload.widgetType === "line" ? "line" : "bar",
            smooth: payload.widgetType === "line",
            showSymbol: payload.widgetType === "line",
            symbolSize: payload.widgetType === "line" ? 10 : undefined,
            stack: ["stacked_bar", "stacked_hbar"].includes(payload.widgetType) ? (metrics.length > 1 ? metric.alias : "total") : undefined,
            barMaxWidth: 42,
            areaStyle: payload.widgetType === "line" ? {{ opacity: 0.12 }} : undefined,
            lineStyle: payload.widgetType === "line" ? {{ width: 4 }} : undefined,
            label: chartSeriesLabel(payload.widgetType),
            labelLayout: {{ hideOverlap: true }},
            emphasis: {{ focus: "series" }},
            data: rows.map((row) => Number(row.series_values?.[group.key]?.[metric.alias] || 0)),
          }})))
        : metrics.map((metric) => ({{
            name: metric.label || metric.alias,
            type: payload.widgetType === "line" ? "line" : "bar",
            smooth: payload.widgetType === "line",
            showSymbol: payload.widgetType === "line",
            symbolSize: payload.widgetType === "line" ? 10 : undefined,
            stack: ["stacked_bar", "stacked_hbar"].includes(payload.widgetType) ? "total" : undefined,
            barMaxWidth: 42,
            areaStyle: payload.widgetType === "line" ? {{ opacity: 0.12 }} : undefined,
            lineStyle: payload.widgetType === "line" ? {{ width: 4 }} : undefined,
            label: chartSeriesLabel(payload.widgetType),
            labelLayout: {{ hideOverlap: true }},
            emphasis: {{ focus: "series" }},
            data: rows.map((row) => Number(row[metric.alias] || 0)),
          }}));

      chart.setOption({{
        animation: false,
        color: palette,
        tooltip: {{ trigger: "axis" }},
        legend: {{
          top: 0,
          itemWidth: 24,
          itemHeight: 14,
          textStyle: {{ color: "#475467", fontSize: 18 }}
        }},
        grid: {{ left: 34, right: 24, top: 72, bottom: 56, containLabel: true }},
        xAxis: isHorizontal
          ? {{
              type: "value",
              axisLabel: {{ color: "#667085", fontSize: 16 }},
              splitLine: {{ lineStyle: {{ color: "rgba(15,23,42,.08)" }} }},
            }}
          : {{
              type: "category",
              data: categories,
              axisLabel: {{ color: "#667085", fontSize: 16, rotate: categories.length > 8 ? 32 : 0 }},
              axisLine: {{ lineStyle: {{ color: "rgba(15,23,42,.1)" }} }},
            }},
        yAxis: isHorizontal
          ? {{
              type: "category",
              data: categories,
              axisLabel: {{ color: "#667085", fontSize: 16 }},
              axisLine: {{ lineStyle: {{ color: "rgba(15,23,42,.1)" }} }},
            }}
          : {{
              type: "value",
              axisLabel: {{ color: "#667085", fontSize: 16 }},
              splitLine: {{ lineStyle: {{ color: "rgba(15,23,42,.08)" }} }},
            }},
        series: chartSeries,
      }});
    }}
  </script>
</body>
</html>
"""


def render_share_image(html: str, output_file: Path) -> Path:
    output_file.parent.mkdir(parents=True, exist_ok=True)
    edge_path = find_edge()
    with tempfile.NamedTemporaryFile("w", suffix=".html", encoding="utf-8", delete=False) as handle:
        html_path = Path(handle.name)
        handle.write(html)
    try:
        subprocess.run(
            [
                str(edge_path),
                "--headless=new",
                "--disable-gpu",
                "--hide-scrollbars",
                "--force-device-scale-factor=1",
                "--window-size=1260,720",
                "--virtual-time-budget=6000",
                f"--screenshot={output_file.resolve()}",
                html_path.as_uri(),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
    finally:
        html_path.unlink(missing_ok=True)
    return output_file


async def share_dashboard_widget(
    *,
    widget_title: str,
    dataset_label: str,
    widget_type: str,
    target_date: str,
    dimensions: list[str],
    metrics: list[dict[str, Any]],
    rows: list[dict[str, Any]],
    series_field: str = "",
    series_groups: list[dict[str, str]] | None = None,
    group_name: str = "供应链数据同步群",
    message_tag: str = "供应链BI系统测试消息",
    output_dir: Path | None = None,
) -> dict[str, Any]:
    safe_output_dir = output_dir or (Path("output") / "widget-share")
    safe_output_dir.mkdir(parents=True, exist_ok=True)
    safe_stem = "".join(ch if ch.isalnum() else "-" for ch in (widget_title[:24] or "widget")).strip("-") or "widget"
    image_path = safe_output_dir / f"{safe_stem}-{int(asyncio.get_running_loop().time() * 1000)}.png"
    html = build_share_html(
        widget_title=widget_title,
        dataset_label=dataset_label,
        widget_type=widget_type,
        target_date=target_date,
        dimensions=dimensions,
        metrics=metrics,
        rows=rows,
        series_field=series_field or "",
        series_groups=series_groups or [],
    )
    render_share_image(html, image_path)

    oss_service = OSSService()
    remote_name = f"dashboard-share-{image_path.name}"
    image_url = await oss_service.upload_file(str(image_path), remote_name)
    if not image_url:
        raise RuntimeError("图表截图上传失败。")

    notifier = NotificationService()
    message = {
        "msgtype": "markdown",
        "markdown": {
            "title": f"{message_tag}｜{widget_title}",
            "text": (
                f"### {message_tag}\n\n"
                f"> 群组：{group_name}\n\n"
                f"> 图表：{widget_title}\n\n"
                f"> 日期范围：{target_date}\n\n"
                f"> 数据源：{dataset_label}\n\n"
                f"![{widget_title}]({image_url})"
            ),
        },
    }
    sent = await notifier._send_dingtalk_message(message)
    return {
        "sent": sent,
        "image_url": image_url,
        "image_path": str(image_path.resolve()),
        "group_name": group_name,
        "message_tag": message_tag,
        "widget_title": widget_title,
    }
