import { Link } from "@tanstack/react-router";
import { CalendarDays, MapPin, Vote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";

export type EventCardData = {
  id: string;
  title: string;
  category: string;
  cover_image_url: string | null;
  location: string | null;
  starts_at: string | null;
  voting_enabled: boolean;
};

export function EventCard({ event }: { event: EventCardData }) {
  return (
    <Link to="/events/$eventId" params={{ eventId: event.id }} className="group block">
      <Card className="h-full overflow-hidden border-border/70 bg-card p-0 transition-all group-hover:-translate-y-1 group-hover:votix-glow">
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-secondary">
          {event.cover_image_url ? (
            <img
              src={event.cover_image_url}
              alt={event.title}
              loading="lazy"
              className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="votix-gradient-bg flex size-full items-center justify-center text-2xl font-black text-primary-foreground">
              VOTIX
            </div>
          )}
          <div className="absolute left-3 top-3 flex gap-2">
            <Badge className="bg-background/80 text-foreground backdrop-blur">{event.category}</Badge>
            {event.voting_enabled && (
              <Badge className="votix-gradient-bg text-primary-foreground">
                <Vote className="mr-1 size-3" /> Voting
              </Badge>
            )}
          </div>
        </div>
        <div className="space-y-2 p-4">
          <h3 className="line-clamp-2 font-display text-base font-bold">{event.title}</h3>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="size-3.5" /> {formatDateTime(event.starts_at)}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="size-3.5" /> {event.location ?? "Online"}
          </p>
          <span className="votix-gradient-bg mt-2 flex w-full items-center justify-center rounded-md px-4 py-2 text-sm font-bold uppercase tracking-wide text-primary-foreground transition-transform group-hover:scale-[1.02]">
            Get a ticket
          </span>
        </div>
      </Card>
    </Link>
  );
}
