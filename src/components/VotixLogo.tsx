import logoAsset from "@/assets/votix-logo.png.asset.json";

export function VotixLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <img
        src={logoAsset.url}
        alt="VOTIX"
        width={40}
        height={40}
        className="size-10 rounded-lg object-cover"
      />
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
