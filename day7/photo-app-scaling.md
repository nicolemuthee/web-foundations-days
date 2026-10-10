# SnapShare Scaling Plan

## 1. Overview

SnapShare is a photo-sharing application where users upload photos and view feeds containing photos shared by other users. As the platform grows, the system must handle large amounts of image storage, frequent feed requests, and bursts of uploads while maintaining good performance and availability.

This document proposes a scalable architecture for SnapShare, estimates its storage and traffic requirements, explains the responsibilities of each component, and evaluates the main architectural trade-offs and failure scenarios.

## 2. Assumptions and Capacity Estimates

The following assumptions are used for the calculations:

- Registered users: 10 million
- Daily active users (DAU): 10% of registered users
- Photos uploaded per active user per day: 1
- Feed pages viewed per active user per day: 50
- Average original photo size: 2 MB
- Average thumbnail size: 50 KB
- Seconds per day: 86,400
- Peak traffic multiplier: 5 times average traffic
- Storage calculations use decimal units: 1 TB = 1,000 GB

These are planning assumptions rather than measured production statistics. Actual requirements would need to be validated using application telemetry.

### Daily active users

\[
10,000,000 \times 10\% = 1,000,000
\]

SnapShare is expected to have approximately **1 million daily active users**.

### Upload traffic

Each daily active user uploads one photo per day.

\[
1,000,000 \times 1 = 1,000,000
\]

The system must support approximately **1 million photo uploads per day**.

Average upload requests per second:

\[
\frac{1,000,000}{86,400} \approx 11.6
\]

Peak upload requests per second:

\[
11.6 \times 5 \approx 58
\]

The estimated average is approximately 12 uploads per second, with peak traffic of approximately 58 uploads per second.

### Feed traffic

Each daily active user views 50 feed pages per day.

\[
1,000,000 \times 50 = 50,000,000
\]

SnapShare must handle approximately **50 million feed-page requests per day**.

Average feed requests per second:

\[
\frac{50,000,000}{86,400} \approx 579
\]

Peak feed requests per second:

\[
579 \times 5 \approx 2,895
\]

The estimated average is approximately 579 feed requests per second, with peak traffic of approximately 2,900 requests per second.

These figures represent feed-page requests, not individual image requests. A feed page may generate multiple image requests, increasing total delivery traffic.

### Annual image storage

Original photo storage per day:

\[
1,000,000 \times 2\text{ MB} = 2,000,000\text{ MB}
\]

This equals approximately 2 TB per day.

Annual original photo storage:

\[
2\text{ TB} \times 365 = 730\text{ TB}
\]

Thumbnail storage per day:

\[
1,000,000 \times 50\text{ KB} = 50\text{ GB}
\]

Annual thumbnail storage:

\[
50\text{ GB} \times 365 = 18.25\text{ TB}
\]

Total annual image storage:

\[
730 + 18.25 = 748.25\text{ TB}
\]

SnapShare therefore requires approximately **748 TB (0.75 PB) of additional image storage per year**, assuming all uploaded originals and thumbnails are retained. This estimate excludes database storage, backups, replicas, temporary files, and storage overhead.

## 3. Proposed Architecture

SnapShare is expected to be read-heavy because users view feeds much more frequently than they upload photos.

Using the estimated daily totals:

\[
\frac{50,000,000\text{ feed requests}}{1,000,000\text{ uploads}} = 50
\]

This gives approximately **50 feed-page requests for every photo upload**. The architecture should therefore optimize frequent reads while allowing uploads and image processing to scale independently.

### Architecture diagram

```text
                        +----------------------+
                        |        Users         |
                        +----------+-----------+
                                   |
                                   v
                        +----------------------+
                        |      CDN / Edge      |
                        |   Image Delivery     |
                        +----------+-----------+
                                   |
                      Feed/API requests and cache misses
                                   |
                                   v
                        +----------------------+
                        |    Load Balancer     |
                        +----------+-----------+
                                   |
                    +--------------+--------------+
                    |              |              |
                    v              v              v
              +-----------+  +-----------+  +-----------+
              | App Server|  | App Server|  | App Server|
              +-----+-----+  +-----+-----+  +-----+-----+
                    |              |              |
                    +--------------+--------------+
                                   |
                    +--------------+--------------+
                    |                             |
                    v                             v
             +--------------+             +---------------+
             | Redis Cache  |             | Primary DB    |
             | Feed / Data  |             | Metadata      |
             +--------------+             +-------+-------+
                                                    |
                                             +------+------+
                                             |             |
                                             v             v
                                      +-----------+  +-----------+
                                      | Read      |  | Read      |
                                      | Replica 1 |  | Replica 2 |
                                      +-----------+  +-----------+

Uploads:
App Servers ---> Object Storage (Original Photos)
      |
      +------> Durable Queue ---> Thumbnail Workers
                                      |
                                      v
                                Object Storage
                                (Thumbnails)
```

The CDN delivers cached image content close to users. The load balancer distributes application requests across multiple application servers. Redis reduces repeated database reads, while the primary database stores application metadata and read replicas handle suitable read queries.

Original photos and generated thumbnails are stored in object storage. A durable queue separates upload handling from thumbnail processing so that image processing can happen asynchronously.

## 4. Component Responsibilities

### Client application

The client allows users to upload photos, view feeds, and interact with content. It communicates with the backend through authenticated API requests.

### Content Delivery Network (CDN)

The CDN caches and delivers original photos or thumbnails from geographically distributed edge locations. It reduces latency for users and lowers repeated requests to the origin storage.

### Load balancer

The load balancer distributes incoming API traffic across healthy application servers. It performs health checks and removes unhealthy instances from request rotation.

### Application servers

Application servers handle authentication, authorization, upload validation, feed generation, and other business logic. Multiple stateless instances allow capacity to increase by adding more servers.

### Redis cache

Redis stores frequently requested feed data and other reusable information. Cache hits reduce database load and improve response times. Cache entries require expiration and invalidation strategies to limit stale data.

### Primary database

The primary database stores structured information such as users, photo metadata, ownership, captions, and relationships. It handles writes and maintains the authoritative application records.

### Database read replicas

Read replicas serve appropriate read queries so that feed-related database traffic does not overwhelm the primary database. Replication may introduce a delay before recent changes appear on replicas.

### Object storage

Object storage holds original photos and thumbnails. It is designed for storing large amounts of file data without placing the image bytes directly inside relational database records.

### Durable message queue

The queue stores thumbnail-processing jobs until workers can process them. It decouples the upload request from the time-consuming work of creating image variants.

### Thumbnail workers

Thumbnail workers retrieve queued jobs, process original photos, generate appropriately sized thumbnails, and save the resulting files to object storage.

## 5. Why Photos Belong in Object Storage

Storing every photo as a binary object inside the primary relational database would increase database storage requirements and make database backups, replication, and maintenance more expensive.

Object storage is a better fit for large image files because it is designed for durable, scalable file storage. Image files can be uploaded, retrieved, and delivered separately from the structured data needed to manage them.

The database should instead store metadata such as:

- Photo ID
- User ID or owner
- Caption and upload timestamp
- Original image object key
- Thumbnail object key
- Processing status
- Visibility and access-control information

This separation allows image storage and database capacity to scale independently. It also makes it easier to serve images through a CDN without repeatedly querying the primary database for the image bytes.

## 6. Photo Upload Flow

A typical photo upload follows these steps:

1. **Authenticate the user.** The application verifies the user's identity and checks that the user is permitted to upload content.

2. **Validate the upload.** The application checks the file type, file size, and other applicable restrictions. It should not rely solely on the filename or client-provided content type.

3. **Store the original photo.** The application or a controlled direct-upload mechanism writes the original file to object storage.

4. **Create the metadata record.** The primary database stores the photo ID, owner, object key, timestamp, and initial processing status. The application must handle failures between file storage and database writes so that orphaned files can be identified and cleaned up.

5. **Enqueue thumbnail processing.** The system submits a durable job containing the photo ID and the required processing information.

6. **Return an appropriate response.** The API tells the client whether the upload has been accepted and whether thumbnail processing is still pending. It must not claim the entire operation succeeded if a required write failed.

7. **Process the job asynchronously.** A thumbnail worker retrieves the original photo and generates the required thumbnail variants.

8. **Store the thumbnails.** The worker saves the generated files in object storage and records or updates their availability in the metadata database.

9. **Update processing status.** The system marks the photo as ready when the necessary processing steps have completed. The client can display a placeholder while processing remains incomplete.

10. **Update relevant caches.** The system invalidates or refreshes affected feed entries so that users can see newly uploaded content. Cache updates should account for failures and possible delays.

This workflow prevents thumbnail generation from unnecessarily delaying the upload response. It also separates the user-facing upload operation from work that can be retried in the background.

## 7. Architectural Trade-Offs

### Caching versus freshness

Caching feed data reduces repeated database queries and improves response times. However, cached results may not reflect a newly uploaded photo or a recent change immediately.

A suitable approach is to use short expiration periods for rapidly changing feed data and invalidate affected cache entries after relevant writes. The application should tolerate brief delays where strict real-time consistency is not required.

### Read replicas versus consistency

Read replicas increase read capacity and reduce the workload on the primary database. However, replication lag may cause users to see stale information after a write.

The application can send critical reads, such as checks that must immediately reflect a successful write, to the primary database. Less time-sensitive feed reads can use replicas, provided the application can tolerate some delay.

### Asynchronous processing versus simplicity

A message queue and background workers improve scalability by separating thumbnail generation from upload requests. They also introduce operational complexity, including job retries, duplicate delivery, monitoring, and queue management.

For SnapShare's expected upload volume, asynchronous processing provides a useful separation of responsibilities. Workers should make processing idempotent so that a repeated job does not create inconsistent results.

### CDN and object storage versus cost

A CDN reduces repeated origin requests and improves image delivery latency. Object storage scales independently from the database, making it suitable for a growing photo library.

These services introduce storage, delivery, and request costs. Monitoring usage, applying suitable cache policies, and removing eligible temporary or unwanted files can help control expenses. Original photos should only be deleted according to the application's retention and recovery requirements.

### Availability versus operational complexity

Running multiple application servers, database replicas, queues, and workers improves the ability to handle individual component failures. However, each additional component creates configuration, monitoring, and maintenance requirements.

The architecture should introduce redundancy where it addresses a meaningful availability or capacity risk, with tested recovery procedures for critical components.

## 8. Scaling Strategy

SnapShare can scale incrementally as traffic and storage grow.

- **Application tier:** Add application-server instances behind the load balancer as API traffic increases.
- **Image delivery:** Increase CDN coverage and tune caching to reduce repeated origin requests.
- **Database reads:** Optimize queries and indexes, then use read replicas for suitable read-heavy workloads.
- **Caching:** Cache frequently requested feed data and measure hit rates to identify useful improvements.
- **Image processing:** Increase the number of thumbnail workers when queue depth or processing latency rises.
- **Object storage:** Monitor stored data, upload volume, retrieval traffic, and storage costs.
- **Observability:** Track request latency, error rates, database load, cache hit rates, queue depth, worker failures, and storage errors.
- **Capacity planning:** Compare actual traffic and storage measurements against the assumptions in this document and revise capacity estimates regularly.

These changes allow different parts of the system to scale according to their own workloads rather than requiring every component to grow at the same rate.

## 9. Failure Modes and Reliability

A scalable architecture must also consider what happens when individual components become unavailable or return stale information.

### Primary database failure

If the primary database becomes unavailable, operations requiring metadata writes may fail. The application should report the failure clearly rather than claiming that the upload is complete.

Database backups, replication, monitoring, and a tested failover procedure help restore service. Recovery procedures should account for the possibility of recent writes not being present in a backup or replica.

### Application server failure

An application server may crash or become unresponsive. Health checks allow the load balancer to remove unhealthy instances from rotation and direct requests to healthy instances.

Running multiple application servers reduces dependence on a single server. Application servers should remain stateless where practical so that requests can be handled by different instances.

### Queue failure

If the message queue becomes unavailable, thumbnail jobs may not be accepted or processed on time. A durable queue helps retain accepted jobs during temporary worker outages.

The system should monitor queue depth and age, configure retries for temporary errors, and alert operators when jobs are delayed beyond an acceptable threshold. The application should handle a failed job submission without incorrectly reporting successful completion of all upload processing.

### Thumbnail worker failure

A thumbnail worker may crash while processing a photo or fail to access object storage. The queue should support retrying failed jobs, using backoff to avoid repeatedly overwhelming an unhealthy dependency.

Processing should be idempotent so that duplicate job deliveries do not produce inconsistent results. Photos whose thumbnails are not ready can display a placeholder until processing succeeds.

### Cache failure or stale feed data

If Redis becomes unavailable, the application can fall back to the database for required reads. However, a sudden increase in database traffic could cause additional load, so fallback behavior should be monitored and protected with suitable limits.

Cache expiration and invalidation reduce the risk of serving outdated feed data. Cache invalidation failures should be observable, and the application should have a recovery strategy for refreshing affected entries.

### Object storage failure

If object storage becomes unavailable, uploads or image retrieval may fail even if the application servers and database remain healthy. The system should monitor storage errors and use the provider's availability and durability features.

For critical data, appropriate backup or recovery options should be defined. The application should distinguish between stored originals and thumbnails that are still being generated, and it should avoid marking an image as available when the underlying object cannot be confirmed.

### Network or dependency failure

A network interruption can prevent application servers from reaching the database, queue, cache, or object storage. Requests should use sensible timeouts and bounded retries rather than waiting indefinitely or retrying without limits.

Monitoring, alerts, and documented recovery procedures help operators identify the affected component and restore service.

These measures reduce the risk of one component failure causing a complete outage. Reliability depends not only on redundancy but also on detecting failures, handling partial completion, and testing recovery procedures regularly.

## 10. Conclusion

SnapShare is a read-heavy photo-sharing application expected to support approximately 1 million daily active users, 50 million feed-page requests per day, and 1 million photo uploads per day under the stated assumptions.

The estimated average traffic is approximately 579 feed requests per second and 12 uploads per second, with peak estimates of approximately 2,900 feed requests per second and 58 uploads per second. The application is expected to add approximately 748 TB of original-photo and thumbnail storage annually, excluding backups and other overhead.

The proposed architecture uses a CDN, load balancer, multiple application servers, Redis caching, a primary database with read replicas, object storage, a durable message queue, and background thumbnail workers. Separating image files from metadata, caching frequent reads, and processing thumbnails asynchronously helps manage performance and storage growth.

The architecture also considers the trade-offs between freshness, consistency, cost, and operational complexity. Redundancy, monitoring, bounded retries, idempotent processing, and tested recovery procedures help reduce the impact of component failures.

Finally, the capacity estimates should be treated as an initial planning baseline. Production measurements and load testing will be necessary to confirm the actual traffic patterns, storage growth, performance requirements, and cost of operating SnapShare at scale.
