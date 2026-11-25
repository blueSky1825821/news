export default function XinwenlianboHeadlines({ headlines, className }) {
  return (
    <ol className={className}>
      {headlines.map(({ title, subitems }, index) => (
        <li key={index}>
          {title}
          {subitems.length > 0 && (
            <ol className="mb-1 list-decimal pl-5">
              {subitems.map((item, position) => <li key={position}>{item}</li>)}
            </ol>
          )}
        </li>
      ))}
    </ol>
  );
}
