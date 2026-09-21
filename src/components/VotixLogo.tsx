export function VotixLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <span className="votix-gradient-bg flex size-8 items-center justify-center rounded-lg text-sm font-black text-primary-foreground">
        V
      </span>
      <span className="flex flex-col leading-none">
        <span className="votix-gradient-text font-display text-lg font-extrabold tracking-tight">
          VOTIX
        </span>
        <span className="text-[9px] font-medium tracking-[0.18em] text-muted-foreground">
          TICKETS · VOTES
        </span>
      </span>
    </span>
  );
}
