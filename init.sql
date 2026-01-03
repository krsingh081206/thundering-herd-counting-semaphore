CREATE TABLE public.semaphore_parent (
	lock_key varchar(255) NOT NULL,
	current_count int4 DEFAULT 0 NOT NULL,
	CONSTRAINT semaphore_parent_pkey PRIMARY KEY (lock_key)
);
 
 
CREATE TABLE public.semaphore_child (
	lock_key varchar(255) NOT NULL,
	"token" varchar(255) NOT NULL,
	expires_on timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	appname varchar(255) NOT NULL,
	CONSTRAINT semaphore_child_pkey PRIMARY KEY (lock_key, token),
	CONSTRAINT semaphore_child_lock_key_fkey FOREIGN KEY (lock_key) REFERENCES public.semaphore_parent(lock_key) ON DELETE CASCADE
);
CREATE INDEX semaphore_child_expires_on_idx ON public.semaphore_child USING btree (expires_on);