export const mainCategories = [
  { categoryId: "natural-science", categoryLabel: "自然科学" },
  { categoryId: "math-logic", categoryLabel: "数学与逻辑" },
  { categoryId: "history", categoryLabel: "历史" },
  { categoryId: "geography", categoryLabel: "地理" },
  { categoryId: "literature-language", categoryLabel: "文学与语言" },
  { categoryId: "arts-culture", categoryLabel: "艺术与文化" },
  { categoryId: "technology-engineering", categoryLabel: "技术与工程" },
  { categoryId: "society-institutions", categoryLabel: "社会与制度" },
  { categoryId: "sports", categoryLabel: "体育" },
  { categoryId: "life-health", categoryLabel: "生活与健康" },
] as const;

export const mainCategoryIds = mainCategories.map(
  ({ categoryId }) => categoryId,
);
