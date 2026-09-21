CREATE TYPE public.ticket_tier_kind AS ENUM ('regular','vip','vvip','table','platinum','custom');

ALTER TABLE public.ticket_types
  ADD COLUMN tier_kind public.ticket_tier_kind NOT NULL DEFAULT 'regular',
  ADD COLUMN sales_starts_at timestamp with time zone,
  ADD COLUMN sales_ends_at timestamp with time zone,
  ADD COLUMN table_label text,
  ADD COLUMN seats_per_table integer,
  ADD COLUMN sort_order integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.validate_ticket_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.sales_starts_at IS NOT NULL AND NEW.sales_ends_at IS NOT NULL
     AND NEW.sales_ends_at <= NEW.sales_starts_at THEN
    RAISE EXCEPTION 'Sales end date must be after the sales start date';
  END IF;
  IF NEW.seats_per_table IS NOT NULL AND NEW.seats_per_table < 1 THEN
    RAISE EXCEPTION 'A table must have at least one seat';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_ticket_type() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER validate_ticket_type_before_write
BEFORE INSERT OR UPDATE ON public.ticket_types
FOR EACH ROW EXECUTE FUNCTION public.validate_ticket_type();