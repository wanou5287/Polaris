from __future__ import annotations

import argparse
import asyncio
import json
import subprocess
import tempfile
from pathlib import Path
from typing import Any
import sys

import requests

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.services.notification_service import NotificationService
from app.services.oss_service import OSSService


EDGE_PATHS = [
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
    Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Share a Polaris dashboard widget to DingTalk.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8888")
    parser.add_argument("--username", default="tester")
    parser.add_argument("--password", default="test123")
    parser.add_argument("--widget-id", type=int, required=True)
    parser.add_argument("--group-name", required=True)
    parser.add_argument("--message-tag", default="北极星系统测试消息")
    parser.add_argument("--output-dir", default="output/widget-share")
    return parser.parse_args()


def find_edge() -> Path:
    for candidate in EDGE_PATHS:
        if candidate.exists():
            return candidate
    raise FileNotFoundError("Microsoft Edge executable not found.")


def login_and_fetch(base_url: str, username: str, password: str, widget_id: int) -> tuple[dict[str, Any], dict[str, Any]]:
    session = requests.Session()
    login_response = session.post(
        f"{base_url}/financial/bi-dashboard/login",
        json={"username": username, "password": password},
        timeout=15,
    )
    login_response.raise_for_status()
    payload = login_response.json()
    if not payload.get("ok"):
        raise RuntimeError(f"Login failed: {payload}")

    meta_response = session.get(f"{base_url}/financial/bi-dashboard/api/meta", timeout=15)
    meta_response.raise_for_status()
    meta = meta_response.json()

    data_response = session.get(
        f"{base_url}/financial/bi-dashboard/api/widgets/{widget_id}/data",
        timeout=30,
    )
    data_response.raise_for_status()
    widget_payload = data_response.json()
    return meta, widget_payload


def chart_html(meta: dict[str, Any], payload: dict[str, Any]) -> str:
    widget_type = payload.get("widget_type") or "line"
    dimensions = payload.get("dimensions") or []
    metrics = payload.get("metrics") or []
    rows = payload.get("rows") or []
    series_field = payload.get("series_field") or ""
    series_groups = payload.get("series_groups") or []
    dataset = payload.get("config", {}).get("dataset") or ""
    dataset_label = meta.get("dataset_map", {}).get(dataset, dataset)
    title = payload.get("title") or "图表"
    target_date = payload.get("target_date") or "--"
    subtitle = f"{dataset_label} | {target_date}"
    chart_payload = {
        "widgetType": widget_type,
        "dimensions": dimensions,
        "metrics": metrics,
        "rows": rows,
        "seriesField": series_field,
        "seriesGroups": series_groups,
        "title": title,
        "subtitle": subtitle,
    }
    payload_json = json.dumps(chart_payload, ensure_ascii=False)
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
  <style>
    html, body {{
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: #f5f7fb;
      font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
    }}
    .frame {{
      width: 1260px;
      height: 720px;
      margin: 0 auto;
      background: linear-gradient(180deg, #ffffff 0%, #fbfcff 100%);
      box-sizing: border-box;
      padding: 24px;
    }}
    .card {{
      width: 100%;
      height: 100%;
      background: rgba(255,255,255,0.96);
      border: 1px solid rgba(15, 23, 42, 0.06);
      border-radius: 28px;
      box-shadow: 0 18px 60px rgba(31, 41, 55, 0.08);
      padding: 24px 24px 18px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
    }}
    .meta {{
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 8px;
      gap: 12px;
    }}
    .title {{
      font-size: 34px;
      line-height: 1.2;
      font-weight: 700;
      color: #0f172a;
    }}
    .subtitle {{
      font-size: 16px;
      color: #667085;
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
    const payload = {payload_json};
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


def render_chart_image(html: str, output_file: Path) -> Path:
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


async def upload_and_send(
    image_path: Path,
    payload: dict[str, Any],
    group_name: str,
    message_tag: str,
) -> tuple[bool, str]:
    oss_service = OSSService()
    remote_name = f"dashboard-share-{payload['widget_id']}-{Path(image_path).stem}.png"
    image_url = await oss_service.upload_file(str(image_path), remote_name)
    if not image_url:
        raise RuntimeError("Failed to upload chart image to OSS.")

    message = {
        "msgtype": "markdown",
        "markdown": {
            "title": f"{message_tag}｜{payload['title']}",
            "text": (
                f"### {message_tag}\n\n"
                f"> 群组：{group_name}\n\n"
                f"> 图表：{payload['title']}\n\n"
                f"> 日期范围：{payload.get('target_date') or '--'}\n\n"
                f"> 数据源：{payload.get('config', {}).get('dataset') or '--'}\n\n"
                f"![{payload['title']}]({image_url})"
            ),
        },
    }
    notifier = NotificationService()
    sent = await notifier._send_dingtalk_message(message)
    return sent, image_url


def main() -> None:
    args = parse_args()
    meta, payload = login_and_fetch(args.base_url, args.username, args.password, args.widget_id)
    html = chart_html(meta, payload)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    image_path = render_chart_image(html, output_dir / f"widget_{args.widget_id}.png")
    sent, image_url = asyncio.run(
        upload_and_send(
            image_path=image_path,
            payload=payload,
            group_name=args.group_name,
            message_tag=args.message_tag,
        )
    )
    print(json.dumps({"sent": sent, "image_url": image_url, "image_path": str(image_path.resolve())}, ensure_ascii=False))


if __name__ == "__main__":
    main()
