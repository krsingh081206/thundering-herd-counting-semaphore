# DB-based Semaphore for Thundering Herd Problem

This project demonstrates a solution to the thundering herd problem using a database-level semaphore implemented in PostgreSQL. The NodeJS script simulates a scenario with multiple concurrent processes attempting to access a shared resource, while the database ensures only a limited number can acquire a lock at any given time.

## Setup

### 1. Database Setup

1.  **Start PostgreSQL:** Ensure you have a running PostgreSQL instance.

2.  **Configure Connection:**
    *   Open the `config.json` file.
    *   Update the database connection details (`user`, `host`, `database`, `password`, `port`) to match your PostgreSQL setup.

3.  **Initialize Schema and Functions:**
    *   You need to execute the SQL scripts in the correct order. You can use a tool like `psql`.
    *   Make sure your `psql` is configured to connect to the correct database (using `PGHOST`, `PGUSER`, `PGDATABASE`, etc., or by passing them as command-line arguments).

    ```bash
    # Create the tables
    psql -f init.sql

    # Create the function to acquire a lock
    psql -f acquire.sql

    # Create the function to release a lock
    psql -f release.sql
    ```

### 2. Install Dependencies

Install the required NodeJS packages using npm:

```bash
npm install
```

### 3. Run the Simulation

Execute the simulation script:

```bash
node thunderherd.js
```

You should see output indicating that multiple processes are attempting to acquire a lock, but only a limited number (`MAX_LOCK_COUNT` in `index.js`) are successful at any given time.

## How it Works

*   `init.sql`: Creates the `semaphore_parent` and `semaphore_child` tables. `semaphore_parent` tracks the number of active locks for a given key, and `semaphore_child` stores the individual lock tokens.
*   `acquire.sql`: Defines the `attempt_to_acquire_semaphore_child` PostgreSQL function. This function atomically checks for expired locks, verifies if the current lock count is below the maximum, and if so, increments the count and issues a new lock token.
*   `release.sql`: Defines the `release_semaphore_child` PostgreSQL function. This function removes a lock token from the `semaphore_child` table and decrements the lock count in `semaphore_parent`.
*   `thunderherd.js`: The NodeJS script that simulates the thundering herd. It spawns multiple "processes" that all try to acquire a semaphore by calling the `attempt_to_acquire_semaphore_child` function. If a lock is acquired, the process "works" for a short duration and then releases the lock.
*   `config.json`: Stores the database connection settings.
*   `package.json`: Defines the project dependencies.
*   `.gitignore`: Prevents `node_modules` and `config.json` from being checked into version control.
