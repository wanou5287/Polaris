export type BiDashboardChartPalette = {
  key: string;
  label: string;
  description: string;
  colors: string[];
};

export const DEFAULT_CHART_PALETTE_KEY = "polaris_vivid";

export const BI_DASHBOARD_CHART_PALETTES: BiDashboardChartPalette[] = [
  {
    key: "polaris_vivid",
    label: "蓝绿橙紫",
    description: "明亮高对比，适合经营总览和 Top 榜单。",
    colors: ["#3867FF", "#34C759", "#FF7A21", "#FFC53D", "#9B5CFF", "#27C9C2"],
  },
  {
    key: "berry_sky",
    label: "莓紫晴空",
    description: "紫粉与蓝天层次，适合分布和趋势对比。",
    colors: ["#A855F7", "#F59E8B", "#6D72E4", "#8EC5FF", "#E879F9", "#C084FC"],
  },
  {
    key: "lagoon_pop",
    label: "海盐果汽",
    description: "蓝绿与橙色搭配，适合双指标和堆叠图。",
    colors: ["#4F6DFF", "#74D39E", "#A855F7", "#58D4E8", "#FF9822", "#2FB8A8"],
  },
  {
    key: "spring_orchard",
    label: "春野果园",
    description: "清亮绿、橙、黄，适合库存与状态分布。",
    colors: ["#35C7A5", "#FF8A3D", "#FFD257", "#84CC5A", "#9CD76A", "#F59E0B"],
  },
  {
    key: "candy_signal",
    label: "活力糖果",
    description: "高识别度，适合需要快速区分系列的看板。",
    colors: ["#FF7A21", "#FFB000", "#3D73E2", "#49C6B7", "#B228E3", "#7C3AED"],
  },
  {
    key: "lime_forest",
    label: "青柠森林",
    description: "偏绿色系，适合库存结构和清洗状态。",
    colors: ["#B15EFF", "#F4CC34", "#C4E34E", "#76D957", "#47C3B8", "#2DB88C"],
  },
  {
    key: "aurora_band",
    label: "极光蓝紫",
    description: "适合趋势图和多系列对比图。",
    colors: ["#9056F4", "#7154F7", "#2F4EEB", "#9BB4FF", "#2D68E3", "#5B7CFA"],
  },
  {
    key: "skyline",
    label: "天幕渐层",
    description: "偏蓝色系，适合单主题经营指标。",
    colors: ["#2F67E3", "#4674F1", "#6D87F4", "#8EA2F7", "#C2CEF7", "#80B6FF"],
  },
  {
    key: "glacier",
    label: "冰川湖面",
    description: "轻盈蓝系，适合线图和面积感更强的展示。",
    colors: ["#4EA9F1", "#69B8F4", "#8CC8F4", "#A5D4F6", "#C9E2F8", "#7FCBF0"],
  },
  {
    key: "forest_layers",
    label: "林地层次",
    description: "深浅绿层次明显，适合状态和结构拆分。",
    colors: ["#11883A", "#2E9846", "#65B26A", "#8BC691", "#C8E7CB", "#A5D6A7"],
  },
  {
    key: "amber_morning",
    label: "琥珀晨曦",
    description: "暖黄色层次，适合单系列强调型图表。",
    colors: ["#FFBE0B", "#FFC93C", "#FFDD73", "#FDE68A", "#FDEFC4", "#F8D45D"],
  },
  {
    key: "sunset_cream",
    label: "落日奶油",
    description: "暖橙到浅奶油过渡，适合温和的经营看板。",
    colors: ["#FF8A1E", "#FFA94D", "#FFC078", "#FFE0B2", "#FFF0DE", "#FDBA74"],
  },
];

export function supportsChartPalette(widgetType: string) {
  return ["bar", "stacked_bar", "stacked_hbar", "line", "pie"].includes(widgetType);
}

export function resolveChartPaletteKey(paletteKey?: string | null) {
  if (!paletteKey) {
    return DEFAULT_CHART_PALETTE_KEY;
  }
  return BI_DASHBOARD_CHART_PALETTES.some((palette) => palette.key === paletteKey)
    ? paletteKey
    : DEFAULT_CHART_PALETTE_KEY;
}

export function getChartPalette(paletteKey?: string | null) {
  const key = resolveChartPaletteKey(paletteKey);
  return (
    BI_DASHBOARD_CHART_PALETTES.find((palette) => palette.key === key) ??
    BI_DASHBOARD_CHART_PALETTES[0]
  );
}
