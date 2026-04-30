export function SectionHeading({ eyebrow, title, description }) {
  return (
    <div className="section-heading">
      <span>{eyebrow}</span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}
