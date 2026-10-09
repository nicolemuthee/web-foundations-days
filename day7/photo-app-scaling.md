# SnapShare Scaling Plan

## 1. Assumptions

- 10,000,000 registered users.
- 10% are active each day, so **daily active users (DAU) = 1,000,000**.
- Each active user uploads 1 photo per day: **1,000,000 uploads per day**.
- Each active user views 50 feed pages per day: **50,000,000 feed views per day**.
- Average photo size is 2 MB; each photo also gets a 50 KB thumbnail.
- One day has 86,400 seconds.
- Peak traffic is 5x the average.
- Sizes use decimal units (1 TB = 1,000,000 MB).

## 2. Estimates

### Uploads per second

- Average: 1,000,000 / 86,400 = **about 11.6 uploads/s**
- Peak: 11.6 x 5 = **about 58 uploads/s**

### Feed views per second

- Average: 50,000,000 / 86,400 = **about 579 views/s**
- Peak: 579 x 5 = **about 2,900 views/s**

### Storage per year

- Originals: 1,000,000 x 2 MB = 2 TB/day, x 365 = **730 TB/year**
- Thumbnails: 1,000,000 x 50 KB = 50 GB/day, x 365 = **about 18 TB/year**
- Total: **about 748 TB/year (roughly 0.75 PB)**

## 3. Read-heavy or write-heavy?

**Read-heavy.** There are 50 feed views for every 1 upload (50,000,000 vs 1,000,000 per day), a 50:1 ratio.

What this means for the design:

- Make reads cheap: serve photos from a CDN and hot feed data from a cache.
- Add database read replicas so reads do not compete with writes.
- Keep the write path simple and push slow work (thumbnails) to the background.
- The storage volume still grows fast, so photo files need cheap, scalable storage.

## 4. Why photos do not go in the database

- Photos are large binary files (2 MB each); 730 TB per year would make the database huge, slow to back up and expensive to scale.
- Database storage is costly compared with file storage, and every photo read would use database connections that metadata queries need.
- Databases cannot serve files through a CDN.

Instead, photo files go in **object storage** (such as S3). The database stores only the metadata: photo id, owner, caption, timestamp and the URL or key of the file in object storage.

## 5. Architecture diagram

```
                        +-----------+
                        |   Users   |
                        | (app/web) |
                        +-----+-----+
                              |
              +---------------+----------------+
              | photos/thumbnails              | API requests
              v                                v
        +-----------+                  +---------------+
        |    CDN    |                  | Load Balancer |
        +-----+-----+                  +-------+-------+
              | cache miss                     |
              v                        +-------+-------+
      +----------------+               |       |       |
      | Object Storage |<--+     +-----v-+ +---v---+ +-v-----+
      | (photos +      |   |     | App   | | App   | | App   |
      |  thumbnails)   |   |     |Server | |Server | |Server |
      +----------------+   |     +--+-+--+ +--+-+--+ +--+-+--+
              ^            |        | |       | |       | |
              |            |        +-+-------+-+-------+-+
              |            |          |   |             |
              |            |   reads  |   | writes      | enqueue job
              |            |          v   v             v
              |            |     +-------+   +-----------+   +-----------+
              |            |     | Cache |   | Primary   |   |   Queue   |
              |            |     |(Redis)|   | Database  |   +-----+-----+
              |            |     +---+---+   +-----+-----+         |
              |            |         | miss        | replication   v
              |            |         v             v         +-----------+
              |            |     +---------------------+     |  Thumbnail|
              |            |     |   Read Replica(s)   |     |  Worker   |
              |            |     +---------------------+     +-----+-----+
              |            |                                       |
              |            +---- original photo saved by app ------+
              +------------------ thumbnail saved by worker -------+
```

## 6. Components (one sentence each)

- **CDN:** Serves photos and thumbnails from servers close to the user, so images load fast and most photo traffic never reaches our servers.
- **Load balancer:** Spreads incoming requests across many app servers so no single server is overloaded and one failing does not take the app down.
- **App servers:** Run the application logic (uploads, feed building, follows) and are stateless, so we can add more as traffic grows.
- **Cache:** Keeps hot data such as recent feeds and user profiles in memory, so repeated reads do not hit the database.
- **Primary database:** Stores metadata (users, photos, follows) reliably and handles all writes.
- **Read replica:** Holds a copy of the database that answers read queries, taking the heavy read load off the primary.
- **Object storage:** Stores the large photo and thumbnail files cheaply and almost without limit, instead of the database.
- **Queue:** Holds thumbnail jobs so the upload request can finish quickly without waiting for image processing.
- **Thumbnail worker:** Picks jobs from the queue, creates the 50 KB thumbnail and saves it, so the slow work happens in the background.

## 7. Upload flow

1. The user picks a photo in the app and taps upload.
2. The request goes through the CDN/load balancer to one of the app servers.
3. The app server checks the user is logged in and validates the file (type and size).
4. The app server saves the original photo to object storage and gets back its key.
5. The app server writes a metadata row (photo id, user id, key, timestamp, thumbnail status "pending") to the primary database.
6. The app server puts a "create thumbnail" job (photo id and key) on the queue.
7. The app server replies "upload successful" to the user. The user does not wait for the thumbnail.
8. A thumbnail worker takes the job from the queue, downloads the original from object storage and creates a 50 KB thumbnail.
9. The worker saves the thumbnail to object storage and updates the database row (thumbnail status "ready").
10. The relevant cached feeds are invalidated or updated, so followers see the new photo, and the feed shows the thumbnail served through the CDN.

## 8. Trade-offs

- **Caching vs freshness:** A cache makes feeds fast and reduces database load, but cached feeds can be a little out of date, so a new photo may take a few seconds to appear. We accept this because slightly stale feeds are fine for a photo app, and a short cache expiry limits the delay.
- **Read replicas vs consistency:** Replicas let us scale reads, but replication has a small delay, so a user may not see their own new photo immediately if the read hits a replica. We can send a user's reads to the primary right after they upload.
- **Queue and worker vs simplicity:** Making thumbnails in the background keeps uploads fast, but adds a queue, workers and the chance that a thumbnail is briefly missing. We show a placeholder until the thumbnail is ready.
- **CDN and object storage vs cost:** They remove most load from our servers, but cost money for storage (about 748 TB/year) and bandwidth. We could move old, rarely viewed photos to cheaper storage tiers.
