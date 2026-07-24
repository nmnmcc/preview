import { matrix, type PreviewDone, type PreviewEmit } from "@nmnmcc/preview";
import { useContext } from "react";
import { Card, type CardTheme } from "./Card";
import { preview, PreviewLocaleContext, type PreviewLocale } from "./preview";

const Messages = {
  en: {
    action: "Mark ready",
    body: "React Context supplies the locale while a preview matrix supplies every theme.",
    confirmedAction: "Ready",
    eyebrow: "React Context",
    heading: "One typed template, four variants.",
  },
  zh: {
    action: "标记完成",
    body: "React Context 提供语言，预览矩阵生成每一种主题。",
    confirmedAction: "已就绪",
    eyebrow: "React Context",
    heading: "一个类型模板，生成四种变体。",
  },
} satisfies Record<
  PreviewLocale,
  {
    readonly action: string;
    readonly body: string;
    readonly confirmedAction: string;
    readonly eyebrow: string;
    readonly heading: string;
  }
>;

const ThemedCard = ({
  done,
  emit,
  theme,
}: {
  readonly done: PreviewDone;
  readonly emit: PreviewEmit;
  readonly theme: CardTheme;
}) => {
  const locale = useContext(PreviewLocaleContext);
  if (locale === undefined) {
    throw new Error("The preview locale provider is missing.");
  }

  return <Card {...Messages[locale]} done={done} emit={emit} theme={theme} />;
};

export default matrix(
  {
    axes: {
      locale: ["en", "zh"],
      theme: ["light", "dark"],
    },
  },
  ({ locale, theme }) =>
    preview({
      locale,
      render: ({ done, emit }) => (
        <ThemedCard done={done} emit={emit} theme={theme} />
      ),
    }),
);
