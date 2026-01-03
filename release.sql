CREATE OR REPLACE FUNCTION public.release_semaphore_child(lockkey character varying, tokenin character varying)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_new_count integer;
BEGIN
    -- Same per-key advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(lockkey));
 
    -- Delete the lock row and decrement counter if something was deleted
    WITH deleted AS (
        DELETE FROM public.semaphore_child l
        WHERE l.lock_key = lockkey
          AND l.token   = tokenin
        RETURNING l.lock_key
    ),
    updated AS (
        UPDATE public.semaphore_parent m
        SET current_count = GREATEST(0, m.current_count - 1)
        FROM deleted d
        WHERE m.lock_key = d.lock_key
        RETURNING m.current_count
    )
    SELECT current_count INTO v_new_count FROM updated;
 
    -- Nothing deleted → invalid token or already cleaned up
    IF NOT FOUND THEN
        RETURN 0;
    END IF;
 
    -- If no more locks for this key, optionally remove parent row
    IF v_new_count <= 0 THEN
        DELETE FROM public.semaphore_parent
        WHERE lock_key = lockkey;
    END IF;
 
    RETURN 1;
END;
 $function$

