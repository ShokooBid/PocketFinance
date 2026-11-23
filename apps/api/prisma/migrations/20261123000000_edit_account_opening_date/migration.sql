CREATE OR REPLACE FUNCTION enforce_account_rules() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE configured_currency text;
BEGIN
  PERFORM id FROM "User" WHERE id = NEW."userId" FOR UPDATE;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW."userId" IS DISTINCT FROM OLD."userId" OR
       NEW.currency IS DISTINCT FROM OLD.currency OR
       NEW."openingBalanceMinor" IS DISTINCT FROM OLD."openingBalanceMinor" THEN
      RAISE EXCEPTION 'Account ownership, currency and opening balance are immutable.'
        USING ERRCODE = '23514', CONSTRAINT = 'Account_baseline_immutable';
    END IF;
    IF OLD."archivedAt" IS NOT NULL AND (NEW.name IS DISTINCT FROM OLD.name OR
       NEW.type IS DISTINCT FROM OLD.type OR NEW."archivedAt" IS DISTINCT FROM OLD."archivedAt" OR
       NEW."openingDate" IS DISTINCT FROM OLD."openingDate") THEN
      RAISE EXCEPTION 'Archived accounts cannot be changed or restored.'
        USING ERRCODE = '23514', CONSTRAINT = 'Account_archived_immutable';
    END IF;
    -- Both normal transactions and transfer legs live in Transaction.
    IF NEW."openingDate" > OLD."openingDate" AND EXISTS (
      SELECT 1 FROM "Transaction"
      WHERE "userId" = NEW."userId" AND "accountId" = NEW.id AND date < NEW."openingDate"
    ) THEN
      RAISE EXCEPTION 'Account opening date cannot follow an existing posting.'
        USING ERRCODE = '23514', CONSTRAINT = 'Account_opening_date_postings';
    END IF;
  ELSE
    SELECT "entryCurrency" INTO configured_currency FROM "FinancePreferences" WHERE "userId" = NEW."userId";
    IF NOT FOUND OR configured_currency IS DISTINCT FROM NEW.currency THEN
      RAISE EXCEPTION 'Choose a permanent currency before creating a matching account.'
        USING ERRCODE = '23514', CONSTRAINT = 'Account_currency_preference';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
