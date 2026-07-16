import { matrix, type Preview } from "@nmnmcc/preview";
import { useContext, useEffect } from "react";
import {
  preview,
  PreviewLocaleContext,
  type PreviewLocale,
} from "./preview";

const messages = {
  en: {
    eyebrow: "Preview",
    heading: "One component, every viewport.",
    body: "This page was mounted by Vite, captured by Playwright, and written by an Effect program.",
    action: "Looks good",
  },
  zh: {
    eyebrow: "预览",
    heading: "一个组件，适配每个视口。",
    body: "Vite 挂载此页面，Playwright 捕获图像，Effect 程序写入文件。",
    action: "效果很好",
  },
} satisfies Record<
  PreviewLocale,
  {
    readonly eyebrow: string;
    readonly heading: string;
    readonly body: string;
    readonly action: string;
  }
>;

type PreviewTheme = "light" | "dark";

const CardPreview = ({
  done,
  theme,
}: {
  readonly done: Preview.PreviewDone;
  readonly theme: PreviewTheme;
}) => {
  const locale = useContext(PreviewLocaleContext);

  useEffect(() => {
    if (locale !== undefined) done();
  }, [done, locale]);

  if (locale === undefined) {
    throw new Error("The preview locale provider is missing.");
  }

  const message = messages[locale];

  return (
    <main
      className="stage"
      data-locale={locale}
      data-preview-ready
      data-theme={theme}
    >
      <article className="card">
        <span className="eyebrow">{message.eyebrow}</span>
        <h1>{message.heading}</h1>
        <p>{message.body}</p>
        <button type="button">{message.action}</button>
      </article>
    </main>
  );
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
      viewports: {
        mobile: true,
        desktop: true,
      },
      locale,
      render: ({ done }) => <CardPreview done={done} theme={theme} />,
    }),
);
