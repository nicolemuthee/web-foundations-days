TicketHub: System Design
TicketHub is a website that sells tickets for concerts and events. This document follows the six-part framework: requirements, estimates, API, data model, architecture, and trade-offs. It also explains how the design prevents two people from buying the same seat.

1. Requirements
   Functional
   Users can register, log in and log out.
   Users can browse and search events by name, date, city and category.
   Users can view an event's details and its seat map with live availability.
   Users can select one or more seats and hold them for a limited time (5 minutes).
   Users can pay for held seats.
   Users can view their purchased tickets and receive a confirmation email.
   Held seats that are not paid for are released automatically when the hold expires.
   Non-functional
   Quality Requirement
   Speed Browsing pages respond in under 300 ms. Seat map loads in under 1 s. Holding a seat responds in under 500 ms, even during a big sale.
   Correctness A seat is never sold to two people. A user is never charged for a seat they do not receive. A payment is never processed twice.
   Fairness During a big sale, people are served in the order they arrive. One user cannot hold many seats or hog the sale with bots.
   Availability Browsing stays up even if payment or email is slow. Target 99.9% uptime, higher during sales.
   Scalability The system handles a traffic spike of 50x or more without manual intervention.
   Security Passwords are hashed. Payment details never touch our servers (handled by a payment provider). All traffic uses HTTPS.
2. Estimates
   Normal day
   Visitors: 50,000 per day, 10 pages each = 500,000 page views/day
   Average rate: 500,000 / 86,400 s ≈ 6 requests/s
   Allowing for busier hours (about 5x the average): ~30 requests/s
   Tickets sold: 5,000/day ≈ 0.06 tickets/s on average
   Conversion: 5,000 / 50,000 = 10% of visitors buy
   Read-to-write ratio: about 100 reads for every 1 purchase, so the system is read-heavy.
   Big sale (popular concert)
   200,000 users try to buy 20,000 seats in the first 10 minutes (600 s).
   Arrival rate: 200,000 / 600 ≈ 333 users/s (most arrive in the first minute, so plan for several times that at the very start).
   Each user loads the event, the seat map and tries 1–3 holds, about 10 requests each = 2,000,000 requests / 600 s ≈ 3,300 requests/s on average. With a rush in the first seconds and refreshing, we design for ~10,000 requests/s at peak.
   Seat hold attempts: at least 200,000 in 10 minutes ≈ 333/s, and roughly 90% must fail because only 20,000 seats exist (demand is 10x supply).
   Successful sales: 20,000 / 600 ≈ 33 tickets/s.
   Comparison
   Measure Normal Big sale Increase
   Requests/s ~30 (peak hour) ~10,000 (peak) ~300x
   Users arriving/s ~0.6 ~333 ~500x
   Tickets sold/s 0.06 33 ~550x
   Tickets sold in total 5,000 per day 20,000 in 10 min one concert sells 4x a normal day in 10 minutes
   The big sale is not just "more of the same". It is a sudden spike on the same few rows (the seats of one event). The danger is therefore contention on seat records, not only raw traffic. Designing for the average day would fail completely.

3. API
   All endpoints are JSON over HTTPS. Authenticated endpoints need a bearer token.

# Method and path Purpose Auth

1 GET /events?city=&date=&category=&page= Browse and search events No
2 GET /events/{event_id} Event details No
3 GET /events/{event_id}/seats Seat map with availability (available, held, sold) No
4 POST /events/{event_id}/holds Hold one or more seats for 5 minutes Yes
5 DELETE /holds/{hold_id} Release a hold early Yes
6 POST /orders Pay for held seats and create an order Yes
7 GET /me/tickets View my purchased tickets Yes
8 POST /events/{event_id}/queue Join the waiting room during a big sale Yes
Key requests
Hold seats

POST /events/42/holds
{ "seat_ids": [1801, 1802] }

201 Created
{ "hold_id": "h_9f2", "seat_ids": [1801, 1802], "expires_at": "2026-11-20T18:05:00Z" }

409 Conflict (at least one seat is already taken; nothing is held)
{ "error": "seat_unavailable", "seat_ids": [1802] }
Pay

POST /orders
Headers: Idempotency-Key: 6d1c...
{ "hold_id": "h_9f2", "payment_token": "tok_abc" }

201 Created { "order_id": 7001, "status": "paid", "tickets": [ ... ] }
410 Gone (hold expired)
402 Payment Required (payment declined; seats stay held until expiry)
The Idempotency-Key header means that if the user's browser retries the request, the payment is processed only once.

4. Data model
   users 1 ──< orders 1 ──< order_items >── 1 event_seats >── 1 events
   Tables
   users

Column Type Notes
user_id PK
email text UNIQUE, NOT NULL
password_hash text NOT NULL
created_at timestamp
events

Column Type Notes
event_id PK
name text NOT NULL
venue text
city text indexed
starts_at timestamp indexed
sale_starts_at timestamp when tickets go on sale
category text
event_seats (one row per seat per event; this is the table that matters most)

Column Type Notes
event_id FK → events
seat_id int row/section/number from the venue layout
price numeric
status text available, held, sold; CHECK constraint
held_by FK → users NULL unless held
hold_expires_at timestamp NULL unless held
PRIMARY KEY (event_id, seat_id)
orders

Column Type Notes
order_id PK
user_id FK → users NOT NULL
total numeric
status text paid, failed, refunded
idempotency_key text UNIQUE
payment_ref text reference from payment provider
created_at timestamp
order_items

Column Type Notes
order_id FK → orders
event_id, seat_id FK → event_seats
UNIQUE (event_id, seat_id)
Relationships
A user has many orders (1:N).
An order has many order items (1:N).
An event has many event_seats (1:N).
Each order item points to exactly one event seat, and each event seat can be in at most one order item (enforced by the UNIQUE constraint). 5. How the design prevents two people buying the same seat
The problem: two users click the same seat at the same moment. A naive approach reads, then writes:

1. SELECT status FROM event_seats WHERE seat = 1801 -- both users see "available"
2. UPDATE event_seats SET status = 'held' ... -- both succeed -> double booking
   Between step 1 and step 2, the other user's request slips in. This is a race condition. The fix is to make "check and claim" one atomic step and let the database decide the winner.

Layer 1: atomic conditional update inside a transaction
BEGIN;

UPDATE event_seats
SET status = 'held',
held_by = :user_id,
hold_expires_at = now() + interval '5 minutes'
WHERE event_id = :event_id
AND seat_id IN (:seat_ids)
AND (status = 'available'
OR (status = 'held' AND hold_expires_at < now()));

-- if rows_affected = number of seats requested -> COMMIT
-- otherwise -> ROLLBACK and return 409
The check (status = 'available') and the change happen in the same statement. The database locks the row while updating it, so the second user's statement waits, then re-checks the row, finds it already held, and updates 0 rows.
Exactly one request gets rows_affected = 1. The loser receives 409 Conflict immediately.
Holding several seats is all-or-nothing: if any seat fails, the transaction rolls back and no seat is held (atomicity). Seat ids are always locked in sorted order so two users selecting overlapping seats cannot deadlock.
Layer 2: payment only succeeds on a valid hold
When the user pays, a second transaction confirms the seats are still theirs:

BEGIN;

UPDATE event_seats
SET status = 'sold'
WHERE event_id = :event_id
AND seat_id IN (:seat_ids)
AND held_by = :user_id
AND status = 'held'
AND hold_expires_at > now();

-- rows_affected must equal the number of seats, else ROLLBACK (410 Gone)
INSERT INTO orders ...;
INSERT INTO order_items ...;

COMMIT;
If the hold expired and someone else grabbed the seat, held_by no longer matches, the update affects 0 rows, and the order is not created. The payment charge is only captured after this succeeds, and is refunded if the transaction fails.

Layer 3: constraints as a safety net
Even if a bug appears in the application code, the database refuses bad data:

PRIMARY KEY (event_id, seat_id) on event_seats, so a seat exists once per event.
UNIQUE (event_id, seat_id) on order_items, so a seat can appear in at most one order. A second insert fails with an error and the whole transaction rolls back.
CHECK (status IN ('available','held','sold')).
Layer 4: holds expire safely
A background worker runs every few seconds and resets expired holds back to available. Because the hold query in Layer 1 also treats expired holds as available, correctness never depends on the worker running on time.

Why not do this in application code or in the cache?
A lock held in application memory does not work across multiple API servers. Redis is used for the queue and for read caching, but the database is the single source of truth for seat ownership, because it gives us transactions and constraints.

6. Architecture
   Components
   Component What it does Why it is needed
   CDN Serves images, JavaScript, CSS and cached event pages from servers close to users. Removes most of the static load from our servers.
   Load balancer Spreads requests across API servers and removes unhealthy ones. Avoids a single point of failure.
   Waiting room (queue service) During a big sale, admits users in order of arrival at a controlled rate (e.g. 500 users per minute). Keeps queue position in Redis. Protects the database from 200,000 users at once and provides fairness (first in, first served).
   API servers Stateless servers that run the endpoints in section 3. Stateless means we can add more copies quickly when traffic grows.
   Redis cache Stores event details and a short-lived (1–2 second) copy of the seat map. Also stores queue and rate-limit counters. Absorbs the 100:1 read load. Seat map reads never hit the primary database.
   Primary database (PostgreSQL) Stores all data; the only place where seats are held or sold. Transactions and constraints guarantee correctness.
   Read replicas Copies of the database used for browsing, search and "my tickets". Keeps reads off the primary so it only does seat writes.
   Message queue + workers Sends confirmation emails, generates ticket PDFs/QR codes, releases expired holds. Slow tasks happen outside the request so the buyer is not kept waiting.
   Payment provider Handles card details and returns a payment token, plus a webhook confirming payment. We never store card data; failures in payment do not crash the site.
   How it survives the big sale
   Traffic is flattened before it reaches the database. The CDN serves static content; the waiting room lets in only as many users as the system can handle; the rest see their queue position. The database sees a steady stream instead of a wall of 200,000 users.
   Reads are cached. The seat map is the most requested item. It is served from Redis (refreshed every 1–2 s, or pushed on change), so thousands of users refreshing the seat map cost almost nothing. A small amount of staleness is acceptable because the hold step is always checked against the database.
   Writes are small and fast. A hold is one short transaction touching a few rows. At ~333 attempts per second, with 90% failing instantly, a single well-indexed PostgreSQL primary can handle this.
   Failure is cheap. Losers get an immediate 409, not a timeout. The UI tells them to choose another seat.
   Pre-scaling. Because sale times are known (sale_starts_at), we add API servers and warm the cache before the sale starts instead of waiting for autoscaling to react.
   Fairness controls. Per-user and per-IP rate limiting, a limit of 6 seats per user per event, and one active hold set per user reduce bots and seat hogging.
   Isolation. Slow email or payment issues do not block seat holding because they run through the queue and a separate provider.
7. Trade-offs
8. Strong consistency in the database vs. speed from a cache.
   We make the primary database the only authority for seat ownership. This is slower than letting Redis decide, and it makes the primary a potential bottleneck. We accept it because selling the same seat twice is the worst failure possible (angry customers, refunds, legal issues), whereas being a few milliseconds slower is only a mild inconvenience. We reduce the cost by caching only reads, keeping transactions short, and putting a queue in front.

9. Waiting room (fairness and stability) vs. user friction.
   A queue protects the system and is fair, but users must wait and some will give up or be annoyed. Without it, the system could crash and everybody would lose, and the fastest bots would win. We accept the friction because a predictable wait is better than a failure, and we show queue position and an estimated time to reduce frustration.

10. Hold duration: short vs. long.
    A 5-minute hold gives people enough time to pay but locks those seats from others. A shorter hold (2 minutes) frees seats faster but makes users fail at payment, which is frustrating. A longer one lets abandoned carts block real buyers during a big sale. We chose 5 minutes as a compromise and could shorten it for the most popular sales.

11. Slightly stale seat map vs. load on the database.
    Caching the seat map for 1–2 seconds means users sometimes click a seat that is already gone and receive a 409. We accept this small error because live, uncached seat maps for 200,000 users would be far more expensive, and correctness is guaranteed by the hold step anyway.

Summary
TicketHub is read-heavy on normal days (~6 requests/s on average) and extremely write-contended during a big sale (~10,000 requests/s at peak on the same seats). The design protects correctness with atomic conditional updates, transactions and unique constraints in the database, and protects performance and fairness with a CDN, cache, read replicas, background workers and a waiting room.
