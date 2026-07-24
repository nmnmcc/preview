import type { PreviewDone, PreviewEmit } from "@nmnmcc/preview";
import { useEffect, useState } from "react";
import "./card.css";

export type CardTheme = "light" | "dark";

export interface CardProps {
  readonly action: string;
  readonly body: string;
  readonly confirmedAction: string;
  readonly eyebrow: string;
  readonly done?: PreviewDone;
  readonly emit?: PreviewEmit;
  readonly heading: string;
  readonly theme?: CardTheme;
}

export const Card = ({
  action,
  body,
  confirmedAction,
  done,
  emit,
  eyebrow,
  heading,
  theme = "light",
}: CardProps) => {
  const [confirmed, setConfirmed] = useState(false);

  preview: {
    useEffect(() => {
      if (done === undefined || emit === undefined) return;
      let active = true;
      void emit("default").then(() => {
        if (active) done();
      });
      return () => {
        active = false;
      };
    }, [done, emit]);
  }

  return (
    <main className="stage" data-theme={theme}>
      <article className="card">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{heading}</h1>
        <p>{body}</p>
        <button
          aria-pressed={confirmed}
          onClick={() => setConfirmed((value) => !value)}
          type="button"
        >
          {confirmed ? confirmedAction : action}
        </button>
      </article>
    </main>
  );
};
