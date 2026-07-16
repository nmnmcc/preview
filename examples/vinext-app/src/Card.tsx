export interface CardProps {
  readonly title: string;
}

const Card = ({ title }: CardProps) => (
  <article data-preview-card>
    <h1>{title}</h1>
    <p>This component runs inside a vinext App Router project.</p>
  </article>
);

export default Card;
