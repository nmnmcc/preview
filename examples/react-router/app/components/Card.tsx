import type { PreviewReady } from "@nmnmcc/preview";
import { useEffect, useState } from "react";

export interface CardProps {
  readonly action: string;
  readonly body: string;
  readonly confirmedAction: string;
  readonly eyebrow: string;
  readonly heading: string;
  readonly ready?: PreviewReady;
}

export const Card = ({
  action,
  body,
  confirmedAction,
  eyebrow,
  heading,
  ready,
}: CardProps) => {
  const [confirmed, setConfirmed] = useState(false);

  preview: {
    useEffect(() => {
      ready?.();
    }, [ready]);
  }

  return (
    <main className="stage" data-theme="light">
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
