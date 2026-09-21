import { Link } from "@tanstack/react-router";
import { VotixLogo } from "@/components/VotixLogo";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border/70 bg-card/40">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-3">
        <div className="space-y-3">
          <VotixLogo />
          <p className="max-w-xs text-sm text-muted-foreground">
            Discover events, buy tickets securely and vote for the people you believe in.
          </p>
        </div>
        <div className="space-y-2 text-sm">
          <p className="font-semibold text-foreground">Platform</p>
          <Link to="/events" className="block text-muted-foreground hover:text-primary">
            Explore events
          </Link>
          <Link to="/dashboard" className="block text-muted-foreground hover:text-primary">
            My tickets & votes
          </Link>
          <Link to="/organizer" className="block text-muted-foreground hover:text-primary">
            Organizer hub
          </Link>
        </div>
        <div className="space-y-2 text-sm">
          <p className="font-semibold text-foreground">Good to know</p>
          <p className="text-muted-foreground">Payments are verified before any ticket is issued.</p>
          <p className="text-muted-foreground">VOTIX keeps 5% of each ticket sale.</p>
        </div>
      </div>
      <div className="border-t border-border/70 px-4 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} VOTIX · Tickets. Votes. Experiences.
      </div>
    </footer>
  );
}
