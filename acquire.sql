CREATE OR REPLACE FUNCTION public.attempt_to_acquire_semaphore_child(lockkey character varying, timeoutsec integer, maxlockcount integer, appname character varying)
 RETURNS character varying
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_token      text;
    v_new_count  integer;
    v_expired_count integer;
    v_epoch_ms      bigint;
 
BEGIN
    -- Lock the key to prevent race
    PERFORM pg_advisory_xact_lock(hashtext(lockkey));
 
    -- Ensure parent row exists
    INSERT INTO public.semaphore_parent (lock_key, current_count)
    VALUES (lockkey, 0)
    ON CONFLICT (lock_key) DO NOTHING;
 
    -----------------------------------------------------------------------
    -- Step 1: Clean up expired locks and decrement current_count correctly
    -----------------------------------------------------------------------
    WITH expired AS (
        DELETE FROM public.semaphore_child
        WHERE lock_key = lockkey
          AND expires_on < CURRENT_TIMESTAMP
        RETURNING 1
    )
    SELECT count(*) INTO v_expired_count FROM expired;
 
    IF v_expired_count > 0 THEN
        UPDATE public.semaphore_parent
        SET current_count = GREATEST(0, current_count - v_expired_count)
        WHERE lock_key = lockkey;
    END IF;
 
    -----------------------------------------------------------------------
    -- Step 2: Evaluate capacity & reserve slot
    -----------------------------------------------------------------------
    UPDATE public.semaphore_parent
    SET current_count = current_count + 1
    WHERE lock_key = lockkey
      AND current_count < maxlockcount
    RETURNING current_count INTO v_new_count;
 
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
 
    -----------------------------------------------------------------------
    -- Step 3: Generate token (epoch millis + increment counter)
    -----------------------------------------------------------------------
    SELECT (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint INTO v_epoch_ms;
 
    v_token := lockkey || '-' || v_epoch_ms || '-' || LPAD(v_new_count::text, 4, '0');
 
    BEGIN
        INSERT INTO public.semaphore_child (lock_key, token, expires_on, appname)
        VALUES (
            lockkey,
            v_token::text,
            CURRENT_TIMESTAMP + (timeoutsec || ' seconds')::interval,
            appname
        );
    EXCEPTION WHEN others THEN
        -- Undo reservation
        UPDATE public.semaphore_parent
        SET current_count = GREATEST(0, current_count - 1)
        WHERE lock_key = lockkey;
        RAISE;
    END;
 
    RETURN v_token::text;
END;
 $function$

