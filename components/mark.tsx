export function BrandMark({ className = "az-brand-mark" }: { className?: string }) {
  return (
    <img
      className={className}
      src="/lumen-mark.png"
      width={32}
      height={32}
      alt=""
      draggable={false}
    />
  );
}
